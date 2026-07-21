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
