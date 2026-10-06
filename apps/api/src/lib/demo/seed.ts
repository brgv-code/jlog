import {
  events,
  applications,
  autofillValues,
  companyLogos,
  createDb,
  cvProfiles,
  cvSources,
  llmConfigs,
  profileFactVariants,
  profileFacts,
  users,
} from '@jlog/db';
import { variantHashFor } from '@jlog/shared';
import { inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Env } from '../../index';
import { cacheLogo, normaliseCompany } from '../companyLogo';
import { encrypt } from '../encryption';
import { DEMO_EMAIL_DOMAIN } from './account';
import {
  AUTOFILL,
  CV_TEXT,
  HISTORY_VARIANTS,
  PERSONA,
  ROLES,
  SECTIONS,
  SOCIALS,
  SUMMARY,
} from './persona';
import { LOGO_ORGS, buildPipeline } from './pipeline';

/**
 * D1 rejects a statement with more than 100 bound parameters, and a multi-row
 * insert binds one per column per row. So rows go in chunks sized to the
 * table's width rather than in one statement.
 */
const MAX_PARAMS = 100;

function chunk<T>(rows: T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(MAX_PARAMS / columns));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);

/**
 * Create one demo account with its whole history, in a single batch.
 *
 * Every visitor gets their own account rather than sharing one. A shared
 * account is one person's status change away from looking broken for everyone
 * else in the room, and it cannot be reset while someone is using it.
 *
 * Fact and variant ids are minted per account. The import path derives them
 * from content, which is right for a real person and wrong here: every demo
 * account has the same CV, and content ids would collide on the primary key.
 */
export async function createDemoAccount(env: Env, now = new Date()) {
  const db = createDb(env.DB);
  const userId = `demo_${crypto.randomUUID().replace(/-/g, '')}`;
  const email = `maya.chen.${shortId()}@${DEMO_EMAIL_DOMAIN}`;
  const name = `${PERSONA.firstName} ${PERSONA.lastName}`;
  const statements: BatchItem<'sqlite'>[] = [];

  statements.push(
    db.insert(users).values({
      id: userId,
      email,
      name,
      emailVerified: true,
      // Comped, not billed: tailoring and drafting are the point of the demo,
      // and `manual` keeps Stripe from ever touching the row (ADR-011).
      plan: 'pro',
      planSource: 'manual',
      createdAt: now,
      updatedAt: now,
    }),
  );

  // The CV, as imported, with every bullet pointing at its line.
  const sourceId = `cvs_${shortId()}${shortId()}`;
  statements.push(
    db.insert(cvSources).values({
      id: sourceId,
      userId,
      format: 'text',
      label: 'Maya Chen CV',
      content: CV_TEXT,
      createdAt: now,
    }),
  );

  const factRows: (typeof profileFacts.$inferInsert)[] = [];
  const bulletIds = new Map<string, string[]>();
  let cursor = 0;
  for (const role of ROLES) {
    const roleId = `pf_role_${shortId()}${shortId()}`;
    factRows.push({
      id: roleId,
      userId,
      kind: 'role',
      parentFactId: null,
      employer: role.employer,
      roleTitle: role.roleTitle,
      location: role.location,
      startDate: role.dates,
      endDate: null,
      canonical: `${role.roleTitle} at ${role.employer}`,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const ids: string[] = [];
    for (const text of role.bullets) {
      const start = CV_TEXT.indexOf(text, cursor);
      if (start !== -1) cursor = start + text.length;
      const id = `pf_${shortId()}${shortId()}`;
      ids.push(id);
      factRows.push({
        id,
        userId,
        kind: 'bullet',
        parentFactId: roleId,
        employer: null,
        roleTitle: null,
        location: null,
        startDate: null,
        endDate: null,
        canonical: text,
        sourceId: start === -1 ? null : sourceId,
        sourceStart: start === -1 ? null : start,
        sourceEnd: start === -1 ? null : start + text.length,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    }
    bulletIds.set(role.employer, ids);
  }
  // Inserted in the CV's order, which is the order the pro package reads them
  // back in: it selects facts without an ORDER BY.
  for (const rows of chunk(factRows, 17)) statements.push(db.insert(profileFacts).values(rows));

  // Each bullet's own words as imported, plus the phrasings written for
  // earlier applications. The latter are what the tailoring view's history
  // line ("used for 2 applications") counts.
  const variantRows: (typeof profileFactVariants.$inferInsert)[] = [];
  for (const role of ROLES) {
    const ids = bulletIds.get(role.employer) ?? [];
    for (const [i, text] of role.bullets.entries()) {
      variantRows.push({
        id: `pv_${shortId()}${shortId()}`,
        factId: ids[i] as string,
        userId,
        content: text,
        contentHash: await variantHashFor(text),
        source: 'import',
        sourceRoleTitle: role.roleTitle,
        sourceCompany: role.employer,
        usedAt: null,
        createdAt: now,
      });
    }
  }
  for (const v of HISTORY_VARIANTS) {
    const factId = bulletIds.get(v.employer)?.[v.bulletIndex];
    if (!factId) continue;
    variantRows.push({
      id: `pv_${shortId()}${shortId()}`,
      factId,
      userId,
      content: v.content,
      contentHash: await variantHashFor(v.content),
      source: 'application',
      sourceRoleTitle: v.roleTitle,
      sourceCompany: v.company,
      usedAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
      createdAt: now,
    });
  }
  for (const rows of chunk(variantRows, 12)) {
    statements.push(db.insert(profileFactVariants).values(rows));
  }

  statements.push(
    db.insert(cvProfiles).values({
      userId,
      firstName: PERSONA.firstName,
      lastName: PERSONA.lastName,
      title: PERSONA.title,
      address: PERSONA.address,
      email: PERSONA.email,
      homepage: PERSONA.homepage,
      photo: '',
      template: 'classic',
      socials: SOCIALS,
      summary: SUMMARY,
      sections: SECTIONS,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(autofillValues).values({ userId, data: AUTOFILL, updatedAt: now }),
    // Shown in Settings so the provider panel is not an empty "configure me"
    // prompt. Never used: every model call for a demo account is answered by
    // lib/demo/model.ts before a provider is built.
    db
      .insert(llmConfigs)
      .values({
        userId,
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKeyEncrypted: env.ENCRYPTION_SECRET
          ? await encrypt('demo-account-key', env.ENCRYPTION_SECRET)
          : null,
        ollamaUrl: null,
        updatedAt: now,
      }),
  );

  const pipeline = buildPipeline(now);
  const appRows = pipeline.applications.map((a) => ({ ...a, userId, metadata: null }));
  for (const rows of chunk(appRows, 19)) statements.push(db.insert(applications).values(rows));
  for (const rows of chunk(pipeline.events, 6)) {
    statements.push(
      db.insert(events).values(
        rows.map((e) => ({
          ...e,
          // Stored the way the routes store it: stringified into the JSON
          // column. The timeline parses either shape, but matching keeps one.
          payload: JSON.stringify(e.payload),
        })),
      ),
    );
  }

  // One batch, so a failure part way leaves no half-built account behind.
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

  return { userId, email, name, applications: appRows.length };
}

/** How many logos one demo sign-in may fetch. The rest wait for the next one. */
const LOGO_FETCHES_PER_RUN = 12;

/**
 * Fill the shared logo cache for the demo's companies, a few at a time.
 *
 * Run after the response, so a cold cache never slows a sign-in. Each company
 * is fetched once for the whole deployment and every later user benefits, so
 * after a handful of demo sign-ins this does nothing but one query.
 */
export async function warmDemoLogos(env: Env): Promise<void> {
  const db = createDb(env.DB);
  const keys = LOGO_ORGS.map(([company]) => normaliseCompany(company));
  const known = new Set(
    (
      await db
        .select({ key: companyLogos.companyKey })
        .from(companyLogos)
        .where(inArray(companyLogos.companyKey, keys))
    ).map((r) => r.key),
  );
  const missing = LOGO_ORGS.filter(([company]) => !known.has(normaliseCompany(company))).slice(
    0,
    LOGO_FETCHES_PER_RUN,
  );
  for (const [company, org] of missing) {
    await cacheLogo(env, company, `https://github.com/${org}.png?size=128`).catch(() => {});
  }
}
