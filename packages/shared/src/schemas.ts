import { z } from 'zod';

export const githubUserSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  avatar_url: z.string(),
  login: z.string(),
});

export const githubEmailSchema = z.object({
  email: z.string(),
  primary: z.boolean(),
  verified: z.boolean(),
});

export const PLANS = ['free', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
    plan: z.enum(PLANS),
  }),
});

export const APPLICATION_STATUSES = [
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const createApplicationSchema = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  location: z.string().max(200).nullish(),
  status: z.enum(APPLICATION_STATUSES).default('saved'),
  sourceUrl: z.string().url().nullish(),
  sourceSite: z.string().max(50).nullish(),
  appliedAt: z.number().int().optional(),
  notes: z.string().max(10000).nullish(),
  jobDescription: z.string().max(50000).nullish(),
  salaryMin: z.number().int().positive().nullish(),
  salaryMax: z.number().int().positive().nullish(),
  salaryCurrency: z.string().max(3).default('USD'),
  responseReceivedAt: z.number().int().nullish(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateApplicationSchema = createApplicationSchema.partial();

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(APPLICATION_STATUSES).optional(),
  sort: z.enum(['createdAt', 'appliedAt', 'company']).default('createdAt'),
  q: z.string().max(200).optional(),
});

export const llmProviders = ['anthropic', 'openai', 'gemini', 'ollama'] as const;
export type LLMProviderName = (typeof llmProviders)[number];

export const llmConfigSchema = z.object({
  provider: z.enum(llmProviders),
  model: z.string().min(1).max(100),
  apiKey: z.string().max(500).optional(),
  ollamaUrl: z.string().url().optional(),
});

export const extractSchema = z.object({
  html: z.string().min(1).max(50000),
  url: z.string().url().optional(),
});

export const settingsSchema = z.object({
  analyticsOptIn: z.boolean(),
});

export const FOLLOW_UP_CHANNELS = ['email', 'whatsapp'] as const;

export const followUpEventSchema = z.object({
  channel: z.enum(FOLLOW_UP_CHANNELS),
});

// --- Document asset references inside LaTeX source ---

/**
 * LaTeX commands whose brace argument names a file that has to exist next to
 * the document at compile time.
 */
const ASSET_REF_COMMANDS = [
  'photo',
  'includegraphics',
  'input',
  'include',
  'bibliography',
  'addbibresource',
  'lstinputlisting',
] as const;

const ASSET_REF_RE = new RegExp(
  `\\\\(${ASSET_REF_COMMANDS.join('|')})(?:\\[[^\\]]*\\])*\\{([^}]*)\\}`,
  'g',
);

/**
 * Find asset references that cannot resolve inside the compile sandbox.
 *
 * The compile service gives every job its own directory and strips `..` from
 * asset paths, so a document referencing a parent directory or an absolute path
 * fails at compile time with an unrecoverable XeTeX error rather than anything
 * a user could act on:
 *
 *   error: main.tex:28: Unable to load picture or PDF file '../Profile.png'
 *
 * Catching it when the document is saved turns that into a clear message. Real
 * case: a CV exported from Overleaf carried `\photo{../Profile.png}`, which is
 * correct in Overleaf's project layout and impossible in the sandbox.
 */
export function findTraversingAssetRefs(latex: string): string[] {
  const found: string[] = [];
  for (const match of latex.matchAll(ASSET_REF_RE)) {
    const target = (match[2] ?? '').trim();
    if (target === '') continue;
    const traverses = target.split('/').some((seg) => seg === '..');
    if (traverses || target.startsWith('/')) found.push(target);
  }
  return [...new Set(found)];
}

const inDirAssetRefs = (schema: z.ZodString) =>
  schema.superRefine((value, ctx) => {
    const bad = findTraversingAssetRefs(value);
    if (bad.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `asset paths must be relative and in-directory; found ${bad.join(', ')}. Ship the file alongside the document and reference it by name.`,
      });
    }
  });

// --- Documents (base templates + generated, tailored per application) ---

// v1 supports LaTeX only; the column/enum leave room to add 'pdf' later.
export const DOCUMENT_FORMATS = ['latex'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

// `type` is an open set — these are the well-known ones; custom labels allowed.
export const KNOWN_DOCUMENT_TYPES = ['cv', 'cover_letter'] as const;

export const DOCUMENT_STATUSES = ['draft', 'compiled', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// A sibling file shipped into the compile sandbox. Paths must be relative and
// in-directory — the compile service strips `..` — so reject traversal here too.
export const documentAssetSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(255)
    .refine((p) => !p.includes('..') && !p.startsWith('/'), {
      message: 'asset path must be relative and must not traverse directories',
    }),
  encoding: z.enum(['utf8', 'base64']),
  content: z.string().max(2_000_000),
});

export const createBaseDocumentSchema = z.object({
  type: z.string().min(1).max(50),
  label: z.string().min(1).max(120),
  format: z.enum(DOCUMENT_FORMATS).default('latex'),
  content: inDirAssetRefs(z.string().min(1).max(500_000)),
  assets: z.array(documentAssetSchema).max(20).optional(),
  isDefault: z.boolean().default(false),
});

export const updateBaseDocumentSchema = createBaseDocumentSchema.partial();

// --- Profile facts (structured career data tailoring selects from, ADR-005) ---

export const PROFILE_FACT_KINDS = [
  'role',
  'bullet',
  'skill',
  'education',
  'project',
  'summary',
] as const;
export type ProfileFactKind = (typeof PROFILE_FACT_KINDS)[number];

export const PROFILE_FACT_STATUSES = ['active', 'parked', 'archived'] as const;
export type ProfileFactStatus = (typeof PROFILE_FACT_STATUSES)[number];

export const createProfileFactSchema = z.object({
  kind: z.enum(PROFILE_FACT_KINDS),
  parentFactId: z.string().max(64).nullish(),
  employer: z.string().max(200).nullish(),
  roleTitle: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
  // Free text because CV dates are imprecise and often open ended.
  startDate: z.string().max(32).nullish(),
  endDate: z.string().max(32).nullish(),
  canonical: z.string().min(1).max(2000),
  tags: z.array(z.string().max(50)).max(30).optional(),
  status: z.enum(PROFILE_FACT_STATUSES).default('active'),
});

export const updateProfileFactSchema = createProfileFactSchema.partial();

export const createFactVariantSchema = z.object({
  factId: z.string().min(1).max(64),
  content: z.string().min(1).max(2000),
  // Provenance. `sourceRoleTitle` is the selection signal: it records what the
  // phrasing was aimed at, which past applications already encode for free.
  source: z.string().max(500).nullish(),
  sourceRoleTitle: z.string().max(200).nullish(),
  sourceCompany: z.string().max(200).nullish(),
  usedAt: z.number().int().nullish(),
});

/** Normalisation used for the variant content hash, so dedupe is whitespace and case insensitive. */
export function normaliseVariantContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase();
}

// --- CV import (paste a CV, review what it found, then write facts) ---

export const CV_IMPORT_FORMATS = ['latex', 'markdown', 'auto'] as const;
export type CvImportFormat = (typeof CV_IMPORT_FORMATS)[number];

export const cvImportPreviewSchema = z.object({
  // 400k is a very long CV and still a small request; the cap exists so a
  // pasted binary cannot be parsed line by line before it is rejected.
  source: z.string().min(1).max(400_000),
  format: z.enum(CV_IMPORT_FORMATS).default('auto'),
});

/**
 * Only what the user ticked. The preview is not replayed here: the client sends
 * back the rows it chose, so nothing can be written that was not on screen.
 */
export const cvImportCommitSchema = z.object({
  roles: z
    .array(
      z.object({
        employer: z.string().min(1).max(200),
        roleTitle: z.string().max(200).default(''),
        dates: z.string().max(64).default(''),
        location: z.string().max(200).default(''),
        bullets: z.array(z.string().min(1).max(2000)).max(200),
      }),
    )
    .max(50),
});

// --- CV profile (the non-claim half: name, contact, skills, education) ---

export const cvProfileSchema = z.object({
  firstName: z.string().max(100).default(''),
  lastName: z.string().max(100).default(''),
  title: z.string().max(200).default(''),
  address: z.string().max(300).default(''),
  email: z.string().max(200).default(''),
  homepage: z.string().max(300).default(''),
  /** A filename shipped with the compile request, not the image bytes. */
  photo: z.string().max(300).default(''),
  socials: z
    .array(z.object({ network: z.string().max(50), handle: z.string().max(200) }))
    .max(10)
    .default([]),
  summary: z.string().max(4000).default(''),
  sections: z
    .array(
      z.object({
        heading: z.string().max(100),
        items: z
          .array(z.object({ left: z.string().max(200), right: z.string().max(1000) }))
          .max(50),
      }),
    )
    .max(20)
    .default([]),
});

export type CvProfileInput = z.infer<typeof cvProfileSchema>;
