import type { Context } from 'hono';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

export const isProEnabled = false as const;

export const PRO_REQUIRED_ERROR = {
  error: {
    code: 'PRO_REQUIRED',
    message: 'This feature requires a jlog Pro subscription.',
  },
} as const;

export const PRO_UPSELL = {
  title: 'Tailored documents are a Pro feature',
  body: 'Generate a job-specific CV and cover letter from your base templates, compiled to PDF — upgrade to jlog Pro to unlock.',
  cta: 'Upgrade to Pro',
} as const;

export const requirePro = createMiddleware(async (c) => {
  return c.json(PRO_REQUIRED_ERROR, 402);
});

export type TailorRequest = { name: string; system: string; user: string };
export type TailorJson = (req: TailorRequest) => Promise<unknown>;

export type TraceStep = <T>(name: string, run: () => Promise<T>) => Promise<T>;

export type TraceOptions = { session?: string };

export type TracedLLM = { call: TailorJson; step: TraceStep };

export type ProDeps = {
  makeTailor?: (c: Context, options?: TraceOptions) => Promise<TracedLLM | null>;
  makeDrafter?: (c: Context, options?: TraceOptions) => Promise<TracedLLM | null>;
  startTrace?: (c: Context, name: string) => Promise<TraceStep>;
};

export function createProRouter(_deps: ProDeps = {}): Hono {
  const router = new Hono();
  router.all('*', (c) => c.json(PRO_REQUIRED_ERROR, 402));
  return router;
}
