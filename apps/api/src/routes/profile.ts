/**
 * Getting a CV into `profile_facts` (ADR-005).
 *
 * Before this, the only way facts existed was running two scripts over a corpus
 * of .tex files and applying the SQL by hand, which meant tailoring worked for
 * exactly one person. Import is the front door: paste a CV, see what was read
 * out of it, tick what is true, and only then is anything written.
 *
 * The preview writes nothing on purpose. These rows become the source of truth
 * for documents sent to employers, so a parse that guessed wrong has to be
 * visible before it is stored, not after.
 */
import { createDb, cvProfiles, cvSources, profileFactVariants, profileFacts } from '@jlog/db';
import {
  CV_STRUCTURE_SYSTEM,
  HttpError,
  type ImportedCv,
  cvImportCommitSchema,
  cvImportPreviewSchema,
  cvProfileSchema,
  cvStructureSchema,
  detectCvFormat,
  factIdFor,
  locateAll,
  parseLatexCv,
  parseMarkdownCv,
  parseTextCv,
  roleFactIdFor,
  toImportedCv,
  variantHashFor,
  variantIdFor,
} from '@jlog/shared';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { requireSession } from '../lib/session';
import { makeJsonCaller } from '../lib/tailor';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Text out of a PDF has no structure to read, so a model sorts it when one is
 * configured. It is a reading, not a rewrite: `toImportedCv` checks every
 * bullet back against the source and drops anything the model reworded.
 *
 * A failure here falls through to the rules-based reader rather than stopping
 * the import. A rough reading a human is about to review beats no reading, and
 * the response says which one produced it.
 */
async function structureText(
  c: Parameters<typeof makeJsonCaller>[0],
  source: string,
): Promise<{ cv: ImportedCv; readBy: 'model' | 'rules' }> {
  const callJson = await makeJsonCaller(c, { name: 'import-cv', tags: ['cv-import'] });
  if (!callJson) return { cv: parseTextCv(source), readBy: 'rules' };

  try {
    const raw = await callJson({
      name: 'structure-cv-text',
      system: CV_STRUCTURE_SYSTEM,
      user: source,
    });
    const parsed = cvStructureSchema.safeParse(raw);
    if (!parsed.success) return { cv: parseTextCv(source), readBy: 'rules' };
    const cv = toImportedCv(parsed.data, source);
    // A model that returned nothing usable is worse than the rules, which at
    // least find the lines carrying dates.
    if (!cv.roles.length) return { cv: parseTextCv(source), readBy: 'rules' };
    return { cv, readBy: 'model' };
  } catch {
    return { cv: parseTextCv(source), readBy: 'rules' };
  }
}

function parse(source: string, format: 'latex' | 'markdown'): ImportedCv {
  return format === 'latex' ? parseLatexCv(source) : parseMarkdownCv(source);
}

router.post('/import/preview', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = cvImportPreviewSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  // 'text' is what a PDF becomes: extracted in the browser, so the file itself
  // never leaves the machine unless its words are imported.
  const format =
    parsed.data.format === 'auto' ? detectCvFormat(parsed.data.source) : parsed.data.format;
  const { cv, readBy } =
    format === 'text'
      ? await structureText(c, parsed.data.source)
      : { cv: parse(parsed.data.source, format), readBy: 'rules' as const };

  // Which of these are already stored, so review can say "you have this" rather
  // than presenting a re-import as new work.
  const ids = await Promise.all(
    cv.roles.flatMap((role) => role.bullets.map((text) => factIdFor(role.employer, text))),
  );
  const db = createDb(c.env.DB);
  const existing = ids.length
    ? await db
        .select({ id: profileFacts.id })
        .from(profileFacts)
        .where(and(eq(profileFacts.userId, session.userId), inArray(profileFacts.id, ids)))
    : [];
  const known = new Set(existing.map((row) => row.id));

  let cursor = 0;
  const roles = cv.roles.map((role) => ({
    ...role,
    bullets: role.bullets.map((text) => ({ text, factId: ids[cursor++] ?? '', known: false })),
  }));
  for (const role of roles) {
    for (const bullet of role.bullets) bullet.known = known.has(bullet.factId);
  }

  return c.json({
    format,
    readBy,
    chrome: cv.chrome,
    roles,
    unplaced: cv.unplaced,
    counts: {
      roles: roles.length,
      bullets: roles.reduce((n, r) => n + r.bullets.length, 0),
      known: roles.reduce((n, r) => n + r.bullets.filter((b) => b.known).length, 0),
    },
  });
});

router.post('/import/commit', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = cvImportCommitSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  const db = createDb(c.env.DB);
  const now = new Date();
  const statements: BatchItem<'sqlite'>[] = [];
  let bulletCount = 0;

  /**
   * The document, kept, plus where in it each bullet was found.
   *
   * Located in commit order and with a cursor, so a line a CV repeats under two
   * roles resolves to the second occurrence for the second role rather than
   * both pointing at the first. A bullet that cannot be found — the model
   * reworded it, or the tick list was edited — gets no span, and the tailoring
   * view says the citation has no line instead of inventing one.
   */
  const source = parsed.data.source?.trim() ? parsed.data.source : null;
  const sourceId = source ? `cvs_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}` : null;
  const orderedBullets = parsed.data.roles.flatMap((role) => role.bullets);
  const spans = source ? locateAll(source, orderedBullets) : [];
  let spanCursor = 0;

  if (source && sourceId) {
    statements.push(
      db.insert(cvSources).values({
        id: sourceId,
        userId: session.userId,
        format: parsed.data.sourceFormat ?? 'text',
        label: '',
        content: source,
        createdAt: now,
      }),
    );
  }

  for (const role of parsed.data.roles) {
    const roleId = await roleFactIdFor(role.employer);
    statements.push(
      db
        .insert(profileFacts)
        .values({
          id: roleId,
          userId: session.userId,
          kind: 'role',
          parentFactId: null,
          employer: role.employer,
          roleTitle: role.roleTitle || null,
          location: role.location || null,
          startDate: role.dates || null,
          endDate: null,
          canonical: `${role.roleTitle || 'Role'} at ${role.employer}`,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        // Re-importing a corrected CV should fix the role, not duplicate it.
        .onConflictDoUpdate({
          target: profileFacts.id,
          set: { roleTitle: role.roleTitle || null, startDate: role.dates || null, updatedAt: now },
        }),
    );

    for (const text of role.bullets) {
      const factId = await factIdFor(role.employer, text);
      const hash = await variantHashFor(text);
      const span = spans[spanCursor++] ?? null;
      const provenance = {
        sourceId: span ? sourceId : null,
        sourceStart: span ? span[0] : null,
        sourceEnd: span ? span[1] : null,
      };
      bulletCount++;
      statements.push(
        db
          .insert(profileFacts)
          .values({
            id: factId,
            userId: session.userId,
            kind: 'bullet',
            parentFactId: roleId,
            employer: null,
            roleTitle: null,
            location: null,
            startDate: null,
            endDate: null,
            canonical: text,
            ...provenance,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
          // Re-importing points the fact at the newer document. An old span
          // into a source that no longer describes this CV is worse than no
          // span: it would highlight a line the user has since rewritten.
          .onConflictDoUpdate({
            target: profileFacts.id,
            set: { canonical: text, parentFactId: roleId, ...provenance, updatedAt: now },
          }),
        // The phrasing as written. The unique index over (user_id, content_hash)
        // is what makes a second import of the same CV a no-op.
        db
          .insert(profileFactVariants)
          .values({
            id: variantIdFor(hash),
            factId,
            userId: session.userId,
            content: text,
            contentHash: hash,
            source: 'import',
            sourceRoleTitle: role.roleTitle || null,
            sourceCompany: role.employer,
            usedAt: null,
            createdAt: now,
          })
          .onConflictDoNothing(),
      );
    }
  }

  if (statements.length) {
    // One batch: a half-applied import would leave bullets parented to a role
    // that was never written.
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  }

  return c.json({
    roles: parsed.data.roles.length,
    bullets: bulletCount,
    // How much of what was imported can be cited back to the document. A low
    // number here is the honest signal that the reading drifted from the text.
    located: spans.filter(Boolean).length,
  });
});

/** What is stored now, shaped the way the review screen shows it. */
router.get('/facts', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);

  const rows = await db
    .select()
    .from(profileFacts)
    .where(and(eq(profileFacts.userId, session.userId), eq(profileFacts.status, 'active')));

  const roles = rows.filter((r) => r.kind === 'role');
  const bullets = rows.filter((r) => r.kind === 'bullet');

  return c.json({
    roles: roles.map((role) => ({
      id: role.id,
      employer: role.employer,
      roleTitle: role.roleTitle,
      dates: role.startDate,
      location: role.location,
      bullets: bullets
        .filter((b) => b.parentFactId === role.id)
        .map((b) => ({ id: b.id, text: b.canonical })),
    })),
    // A bullet whose role was archived still belongs to the user.
    orphans: bullets
      .filter((b) => !roles.some((r) => r.id === b.parentFactId))
      .map((b) => ({ id: b.id, text: b.canonical })),
  });
});

/**
 * The imported CV, verbatim, with the character range each fact occupies in it.
 *
 * This is what makes a generated bullet citable to something a human
 * recognises. The tailoring view renders `content` as the document and
 * highlights `spans[factId]` for whichever bullet is selected, so the claim
 * "every line comes from your own CV" is shown rather than asserted.
 *
 * The newest source wins. Re-importing a corrected CV re-points the facts at
 * it, and an older document is kept only as history — citing into it would
 * highlight lines the user has since rewritten.
 *
 * Served with `source: null` rather than 404 when nothing was ever imported:
 * facts seeded by the corpus scripts, or imported before sources were kept, are
 * a valid state the view degrades to instead of an error.
 */
router.get('/cv-source', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);

  const [source] = await db
    .select()
    .from(cvSources)
    .where(eq(cvSources.userId, session.userId))
    .orderBy(desc(cvSources.createdAt))
    .limit(1);

  if (!source) return c.json({ source: null, spans: {} });

  const rows = await db
    .select({
      id: profileFacts.id,
      start: profileFacts.sourceStart,
      end: profileFacts.sourceEnd,
    })
    .from(profileFacts)
    .where(
      and(
        eq(profileFacts.userId, session.userId),
        eq(profileFacts.sourceId, source.id),
        isNotNull(profileFacts.sourceStart),
      ),
    );

  const spans: Record<string, [number, number]> = {};
  for (const row of rows) {
    // Belt and braces against a span that outlived an edit to the document:
    // an out-of-range range would highlight nothing and dim everything.
    if (row.start === null || row.end === null) continue;
    if (row.start < 0 || row.end > source.content.length || row.start >= row.end) continue;
    spans[row.id] = [row.start, row.end];
  }

  return c.json({
    source: {
      id: source.id,
      format: source.format,
      content: source.content,
      importedAt: source.createdAt.getTime(),
    },
    spans,
  });
});

/**
 * The CV profile: name, contact, and the blocks around the facts.
 *
 * Served empty rather than 404 when there is no row. A profile nobody has
 * filled in yet is a valid state, and making the client special-case a missing
 * one only invites it to render undefined into an input.
 */
router.get('/cv', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);

  const [row] = await db.select().from(cvProfiles).where(eq(cvProfiles.userId, session.userId));

  return c.json({
    profile: {
      firstName: row?.firstName ?? '',
      lastName: row?.lastName ?? '',
      title: row?.title ?? '',
      address: row?.address ?? '',
      email: row?.email ?? '',
      homepage: row?.homepage ?? '',
      photo: row?.photo ?? '',
      socials: row?.socials ?? [],
      summary: row?.summary ?? '',
      sections: row?.sections ?? [],
    },
    // Whether anything has been stored, which is what tells the client that a
    // browser-local profile is worth sending up rather than discarding.
    stored: Boolean(row),
  });
});

router.put('/cv', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = cvProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  const db = createDb(c.env.DB);
  const now = new Date();
  await db
    .insert(cvProfiles)
    .values({ userId: session.userId, ...parsed.data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: cvProfiles.userId, set: { ...parsed.data, updatedAt: now } });

  return c.json({ profile: parsed.data, stored: true });
});

export default router;
