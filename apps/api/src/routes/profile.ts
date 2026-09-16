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
import { createDb, profileFactVariants, profileFacts } from '@jlog/db';
import {
  HttpError,
  type ImportedCv,
  cvImportCommitSchema,
  cvImportPreviewSchema,
  detectCvFormat,
  factIdFor,
  parseLatexCv,
  parseMarkdownCv,
  roleFactIdFor,
  variantHashFor,
  variantIdFor,
} from '@jlog/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { requireSession } from '../lib/session';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

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

  const format =
    parsed.data.format === 'auto' ? detectCvFormat(parsed.data.source) : parsed.data.format;
  const cv = parse(parsed.data.source, format);

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
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: profileFacts.id,
            set: { canonical: text, parentFactId: roleId, updatedAt: now },
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

  return c.json({ roles: parsed.data.roles.length, bullets: bulletCount });
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

export default router;
