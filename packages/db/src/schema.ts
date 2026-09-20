import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  githubId: integer('github_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  analyticsOptIn: integer('analytics_opt_in', { mode: 'boolean' }).notNull().default(false),
  // Entitlement for paid features (see @jlog/pro). Core/public field; the paywall
  // is enforced server-side off this value, never on the client.
  plan: text('plan', { enum: ['free', 'pro'] })
    .notNull()
    .default('free'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * A file that travels alongside a LaTeX document into the compile sandbox:
 * the photo, a `.cls`/`.sty`, an image. Paths are relative and in-directory
 * (the compile service strips `..`), e.g. `Profile.png`. Binary assets are
 * base64-encoded; text assets (`.cls`/`.sty`) are utf8.
 */
export interface DocumentAsset {
  path: string;
  encoding: 'utf8' | 'base64';
  content: string;
}

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Real column instead of an 'ext_' id prefix — also lets the auth middleware
  // reject a session used via the wrong channel (e.g. an extension token
  // presented as a cookie session id).
  type: text('type', { enum: ['cookie', 'extension'] })
    .notNull()
    .default('cookie'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  company: text('company').notNull(),
  role: text('role').notNull(),
  location: text('location'),
  status: text('status', {
    enum: ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'],
  })
    .notNull()
    .default('saved'),
  sourceUrl: text('source_url'),
  sourceSite: text('source_site'),
  appliedAt: integer('applied_at', { mode: 'timestamp' }),
  notes: text('notes'),
  jobDescription: text('job_description'),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: text('salary_currency').default('USD'),
  responseReceivedAt: integer('response_received_at', { mode: 'timestamp' }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const llmConfigs = sqliteTable('llm_configs', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider', {
    enum: ['anthropic', 'openai', 'gemini', 'ollama'],
  }).notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  model: text('model').notNull(),
  ollamaUrl: text('ollama_url'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * A user's reusable base document (their base CV, base cover letter, or any
 * other type). LaTeX-only in v1 (`format` present for forward-compat with PDF).
 * `type` is an open set: `cv`, `cover_letter`, or any custom label.
 * These rows are core/public; the tailoring that consumes them is the paid part.
 */
export const userDocuments = sqliteTable('user_documents', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  label: text('label').notNull(),
  format: text('format', { enum: ['latex'] })
    .notNull()
    .default('latex'),
  content: text('content').notNull(),
  assets: text('assets', { mode: 'json' }).$type<DocumentAsset[]>(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * A per-application generated document: the tailored `.tex` derived from a base
 * `userDocument` for a specific application, plus its compile state. The PDF is
 * either compiled on demand (pdfKey null) or cached in R2 (pdfKey set).
 */
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  applicationId: text('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  userDocumentId: text('user_document_id').references(() => userDocuments.id, {
    onDelete: 'set null',
  }),
  type: text('type').notNull(),
  format: text('format', { enum: ['latex'] })
    .notNull()
    .default('latex'),
  content: text('content').notNull(),
  assets: text('assets', { mode: 'json' }).$type<DocumentAsset[]>(),
  status: text('status', { enum: ['draft', 'compiled', 'failed'] })
    .notNull()
    .default('draft'),
  pdfKey: text('pdf_key'),
  compileLog: text('compile_log'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * The CV a user imported, kept verbatim.
 *
 * Import used to read a document and throw it away, which left every stored
 * fact traceable to a row id and to nothing a human recognises. Keeping the
 * text is what lets a generated bullet be shown beside the line of your own CV
 * it came from — the claim the product makes, made visible instead of asserted.
 *
 * The file itself is still never uploaded: a PDF's text layer is extracted in
 * the browser and only those words arrive here.
 */
export const cvSources = sqliteTable('cv_sources', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** How it was read: latex, markdown, or text (what a PDF becomes). */
  format: text('format').notNull(),
  label: text('label').notNull().default(''),
  content: text('content').notNull(),
  /**
   * The uploaded file in R2, when there was one. Null for a pasted CV — and for
   * anything imported before files were kept — which is what makes the viewer's
   * text fallback a supported state rather than an error path.
   */
  pdfKey: text('pdf_key'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Structured career facts: the source of truth that tailoring selects from
 * (ADR-005). Core/public — this is the user's own CV data, and a self-hoster
 * needs it; the tailoring that consumes it is the paid part.
 *
 * A bullet hangs off its role through `parentFactId`, so employer, title and
 * dates live on the role and are not repeated on every bullet beneath it.
 */
export const profileFacts = sqliteTable('profile_facts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  parentFactId: text('parent_fact_id'),
  employer: text('employer'),
  roleTitle: text('role_title'),
  location: text('location'),
  // Text rather than timestamps: CV dates are imprecise and often open ended
  // ("2025--current"). Storing what the source says beats inventing precision.
  startDate: text('start_date'),
  endDate: text('end_date'),
  canonical: text('canonical').notNull(),
  /**
   * Where these words sit in the CV they were read out of: the source row, and
   * a half-open character range into its `content`. Null for a fact imported
   * before sources were kept, or one edited since — a citation with nothing to
   * point at says so rather than pointing at the wrong line.
   */
  sourceId: text('source_id').references(() => cvSources.id, { onDelete: 'set null' }),
  sourceStart: integer('source_start'),
  sourceEnd: integer('source_end'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  status: text('status', { enum: ['active', 'parked', 'archived'] })
    .notNull()
    .default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * A real phrasing of a fact, with the role it was written for. One fact recurs
 * across applications in wordings tuned to each target, so the canonical claim
 * and its wordings are separate rows.
 *
 * `contentHash` plus the unique index on (userId, contentHash) is what makes
 * importing a CV corpus idempotent: re-running it cannot duplicate a phrasing.
 */
export const profileFactVariants = sqliteTable('profile_fact_variants', {
  id: text('id').primaryKey(),
  factId: text('fact_id')
    .notNull()
    .references(() => profileFacts.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  source: text('source'),
  sourceRoleTitle: text('source_role_title'),
  sourceCompany: text('source_company'),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * The non-claim half of a CV — name, contact, and the skills / education blocks
 * the renderer puts around the facts.
 *
 * Its own table rather than a `user_documents` row: that one models a LaTeX
 * template, this is the structured data a document is built from. Kept out of
 * `profile_facts` on purpose — an email address is not a claim anyone needs to
 * audit, and mixing the two would blunt the fact gate.
 */
export const cvProfiles = sqliteTable('cv_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  title: text('title').notNull().default(''),
  address: text('address').notNull().default(''),
  email: text('email').notNull().default(''),
  homepage: text('homepage').notNull().default(''),
  /** A filename shipped alongside the compile request, not the image itself. */
  photo: text('photo').notNull().default(''),
  socials: text('socials', { mode: 'json' })
    .$type<{ network: string; handle: string }[]>()
    .notNull()
    .default([]),
  summary: text('summary').notNull().default(''),
  sections: text('sections', { mode: 'json' })
    .$type<{ heading: string; items: { left: string; right: string }[] }[]>()
    .notNull()
    .default([]),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  applicationId: text('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  type: text('type', {
    enum: ['status_change', 'note_added', 'created', 'follow_up_sent'],
  }).notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Company logos, cached once and shared by every user.
 *
 * Deliberately not scoped to a user: a logo is a fact about a company, the same
 * for everyone who applies there. The hundredth person to track Stripe costs no
 * fetch.
 *
 * `missing` is the negative half of the cache. Without it, every render of a
 * company we failed to resolve retries the fetch forever.
 */
export const companyLogos = sqliteTable('company_logos', {
  /** Normalised name — lowercased, legal suffixes stripped. See normaliseCompany(). */
  companyKey: text('company_key').primaryKey(),
  /** The name as first seen, so a human can tell what a key meant. */
  displayName: text('display_name').notNull(),
  r2Key: text('r2_key'),
  contentType: text('content_type'),
  bytes: integer('bytes'),
  /** Where it came from, so a bad capture can be traced back to the board. */
  sourceUrl: text('source_url'),
  /** True when we looked and found nothing. Stops the retry loop. */
  missing: integer('missing', { mode: 'boolean' }).notNull().default(false),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
});
