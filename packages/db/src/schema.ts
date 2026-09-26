import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * A person. Better Auth's `user` model is mapped onto this table rather than
 * being given one of its own, so jlog's own columns (plan, Stripe ids) stay
 * where every route already expects to find them.
 *
 * The three fields Better Auth insists on are `email` (unique), `emailVerified`
 * and `updatedAt`. `avatarUrl` is mapped to its `image` field by name in the
 * auth config, so the column did not have to be renamed.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /**
   * Whether the address has been proven. Better Auth sets this when a provider
   * vouches for the address or when someone follows an emailed link, and reads
   * it back when deciding whether a second sign-in method may attach to an
   * existing account.
   */
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  avatarUrl: text('avatar_url'),
  analyticsOptIn: integer('analytics_opt_in', { mode: 'boolean' }).notNull().default(false),
  // Entitlement for paid features (see @jlog/pro). Core/public field; the paywall
  // is enforced server-side off this value, never on the client.
  plan: text('plan', { enum: ['free', 'pro'] })
    .notNull()
    .default('free'),
  /**
   * Why this user is on their plan, and so who is allowed to change it
   * (ADR-011). `manual` is a comped account and Stripe never touches it; null
   * means nobody has ever billed them. Without this column, comping an account
   * and then processing a `customer.subscription.deleted` silently revokes it.
   */
  planSource: text('plan_source', { enum: ['stripe', 'manual'] }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  /** Stripe's own word for it, kept so `past_due` is not the same as `canceled`. */
  planStatus: text('plan_status'),
  currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  /** Required by Better Auth, which stamps it on every write to the row. */
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Webhook ids already processed. Stripe retries until it gets a 2xx, so
 * duplicates are routine rather than exceptional, and the insert is what makes
 * the handler idempotent.
 */
export const stripeEvents = sqliteTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),
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

/**
 * A browser session, owned entirely by Better Auth.
 *
 * Nothing in jlog writes to this table. The session middleware reads it only
 * through Better Auth's own API, because the cookie that points at a row here
 * is signed and rotated by rules that live in the library, not here.
 */
export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** The value carried in the cookie. Distinct from `id`, and the secret half. */
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * One sign-in method attached to a user — a GitHub account, a Google account,
 * an Apple ID. Several rows may point at the same user, which is what makes
 * "sign in with Google having previously used GitHub" land in the existing
 * account rather than minting a second one.
 *
 * Better Auth owns this table. `accountId` is the provider's own immutable id
 * (Google's and Apple's `sub`, GitHub's numeric id), never the email address —
 * people change the address on an account and would otherwise arrive as a
 * stranger.
 */
export const authAccounts = sqliteTable('auth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  idToken: text('id_token'),
  /**
   * Only ever set by Better Auth's email-and-password provider, which jlog does
   * not enable. The column exists because the library's schema requires it.
   */
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Short-lived proofs in flight — an outstanding magic link, most of all.
 *
 * Better Auth stores the link's token here and deletes the row when it is
 * spent, which is what makes a sign-in link work exactly once. jlog configures
 * the plugin to store these hashed, so a dump of this table is a list of hashes
 * rather than a bundle of working sign-in links.
 */
export const authVerifications = sqliteTable('auth_verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * A long-lived bearer key the Chrome extension presents instead of a cookie.
 *
 * Kept out of Better Auth deliberately. This is not a browser session: it is
 * issued from Settings, it travels in an `Authorization` header from a
 * chrome-extension:// origin, and it has its own lifetime. Folding it into the
 * session table is what used to make "an extension key used as a cookie" a
 * question the middleware had to ask; separate tables make it unaskable.
 */
export const extensionKeys = sqliteTable('extension_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /**
   * User-supplied name for a key ("work laptop"), so the revoke list in
   * Settings is readable. Null for keys minted before the key list existed.
   */
  label: text('label'),
  /** When the key was minted. Null for rows predating the key list. */
  createdAt: integer('created_at', { mode: 'timestamp' }),
  /**
   * A non-expiring key stores `NEVER_EXPIRES_AT` (year 9999) rather than null:
   * this column is NOT NULL and the auth middleware compares every request
   * against it, so a sentinel avoids a table rebuild. Use `isNeverExpiring()`
   * from @jlog/shared before showing this to anyone.
   */
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
  /** Default CV template. Overridden per generation — see ADR-010. */
  template: text('template').notNull().default('classic'),
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

/**
 * Answers an application form asks for that are not on a CV: phone, where the
 * user may work, salary expectation, notice period, and whether to decline EEO
 * questions. ADR-012 phase 2.
 *
 * The autofill fills visa, pay and EEO questions from these values and from
 * nothing else. A value the user never saved means the question stays empty.
 *
 * One JSON document per user, the same shape as `cv_profiles.socials`: the
 * set of answers will grow, and each new one should not cost a migration.
 * Validated by `autofillValuesSchema` in `@jlog/shared` on the way in.
 */
export const autofillValues = sqliteTable('autofill_values', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
