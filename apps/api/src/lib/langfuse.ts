import type { LLMCallReport } from '@jlog/llm';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import type {
  LangfuseGeneration,
  LangfuseGenerationAttributes,
  LangfuseSpan,
} from '@langfuse/tracing';
import {
  propagateAttributes,
  setLangfuseTracerProvider,
  startObservation,
} from '@langfuse/tracing';
import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { Env } from '../index';

const DEFAULT_BASE_URL = 'https://cloud.langfuse.com';

export type TraceAttributes = {
  traceName: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, string>;
};

export type Step = <T>(name: string, run: () => Promise<T>) => Promise<T>;

export type TracedRequest = {
  root: LangfuseSpan;
  generation(name: string, attributes: LangfuseGenerationAttributes): LangfuseGeneration;
  step: Step;
};

export const untracedStep: Step = (_name, run) => run();

export type Tracing = {
  start(attributes: TraceAttributes, input?: unknown): TracedRequest;
  finish(): Promise<void>;
};

type Configured = { fingerprint: string; processor: LangfuseSpanProcessor };

let configured: Configured | null = null;
let contextManagerInstalled = false;

function processorFor(env: Env): LangfuseSpanProcessor | null {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return null;

  const baseUrl = env.LANGFUSE_BASE_URL ?? DEFAULT_BASE_URL;
  const fingerprint = `${env.LANGFUSE_PUBLIC_KEY}@${baseUrl}`;
  if (configured?.fingerprint === fingerprint) return configured.processor;

  if (!contextManagerInstalled) {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    contextManagerInstalled = true;
  }

  const previous = configured?.processor;
  const processor = new LangfuseSpanProcessor({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl,
    ...(env.LANGFUSE_TRACING_ENVIRONMENT ? { environment: env.LANGFUSE_TRACING_ENVIRONMENT } : {}),
  });

  setLangfuseTracerProvider(new BasicTracerProvider({ spanProcessors: [processor] }));
  configured = { fingerprint, processor };
  void previous?.shutdown();

  return processor;
}

export function getTracing(env: Env): Tracing | null {
  const processor = processorFor(env);
  if (!processor) return null;

  const open: Array<{ end(): void }> = [];

  return {
    start(attributes, input) {
      const root = propagateAttributes(attributes, () =>
        startObservation(attributes.traceName, input === undefined ? {} : { input }),
      );
      open.push(root);
      const attempts = new Map<string, number>();

      return {
        root,
        generation(name, generationAttributes) {
          const attempt = (attempts.get(name) ?? 0) + 1;
          attempts.set(name, attempt);
          const generation = propagateAttributes(attributes, () =>
            root.startObservation(
              name,
              {
                ...generationAttributes,
                metadata: { ...generationAttributes.metadata, attempt: String(attempt) },
              },
              { asType: 'generation' },
            ),
          );
          open.push(generation);
          return generation;
        },
        async step(name, run) {
          const span = propagateAttributes(attributes, () => root.startObservation(name));
          open.push(span);
          try {
            return await run();
          } catch (error) {
            span.update({
              level: 'ERROR',
              statusMessage: error instanceof Error ? error.message : String(error),
            });
            throw error;
          } finally {
            span.end();
          }
        },
      };
    },

    async finish() {
      for (const observation of open.splice(0)) observation.end();
      await processor.forceFlush();
    },
  };
}

export function callAttributes(report: LLMCallReport): LangfuseGenerationAttributes {
  const { usage, effortRetried } = report;
  return {
    ...(usage
      ? {
          usageDetails: {
            input: usage.input,
            output: usage.output,
            ...(usage.reasoning ? { output_reasoning_tokens: usage.reasoning } : {}),
            total: usage.input + usage.output,
          },
        }
      : {}),
    ...(effortRetried ? { metadata: { effortRetried: 'true' } } : {}),
  };
}

export async function sessionIdFor(subject: string): Promise<string> {
  const canonical = pageOf(subject) ?? subject.trim();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function pageOf(subject: string): string | null {
  try {
    const url = new URL(subject);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}
