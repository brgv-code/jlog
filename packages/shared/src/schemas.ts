import { z } from 'zod';

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
  location: z.string().max(200).optional(),
  status: z.enum(APPLICATION_STATUSES).default('applied'),
  sourceUrl: z.string().url().optional(),
  sourceSite: z.string().max(50).optional(),
  appliedAt: z.number().int().optional(),
  notes: z.string().max(10000).optional(),
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
