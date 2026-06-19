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

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
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
