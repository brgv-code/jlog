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

/**
 * The attributes Langfuse filters and aggregates on. Since v5 these belong on
 * every observation rather than only on the trace, so they are carried
 * alongside the root span and reapplied to each child — see `Tracing.start`.
 */
export type TraceAttributes = {
  traceName: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  metadata?: Record<string, string>;
};

/**
 * One request's worth of tracing: a root observation plus the generations
 * hanging off it. Created by the tracing middleware, which is also what closes
 * it — the callers here hand back a JSON-calling closure that outlives their
 * own frame, so none of them can say when the request is done.
 */
export type TracedRequest = {
  root: LangfuseSpan;
  /**
   * A cost-bearing child of the root, carrying the same userId/sessionId/tags.
   * Generations are where the money is, so they are the observations that have
   * to be filterable on their own.
   */
  generation(name: string, attributes: LangfuseGenerationAttributes): LangfuseGeneration;
};

export type Tracing = {
  start(attributes: TraceAttributes, input?: unknown): TracedRequest;
  /** Ends every observation this request opened, then exports them. */
  finish(): Promise<void>;
};

type Configured = { fingerprint: string; processor: LangfuseSpanProcessor };

// Workers hands credentials in per request rather than per process, so the
// OpenTelemetry setup is built on first use and then reused for the life of
// the isolate. Re-keying on the credentials means a key rotation rebuilds it
// instead of quietly exporting to the old project.
let configured: Configured | null = null;
let contextManagerInstalled = false;

function processorFor(env: Env): LangfuseSpanProcessor | null {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return null;

  const baseUrl = env.LANGFUSE_BASE_URL ?? DEFAULT_BASE_URL;
  const fingerprint = `${env.LANGFUSE_PUBLIC_KEY}@${baseUrl}`;
  if (configured?.fingerprint === fingerprint) return configured.processor;

  if (!contextManagerInstalled) {
    // `propagateAttributes` passes the correlating attributes down through the
    // OpenTelemetry context, and workerd installs no context manager of its
    // own. Without this every child would be created against an empty context
    // and would carry neither the userId nor the tags.
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

  // An isolated provider rather than the global one: Workers' own tracing owns
  // `@opentelemetry/api`'s global provider, and taking that over would put
  // every platform span in front of the Langfuse exporter.
  setLangfuseTracerProvider(new BasicTracerProvider({ spanProcessors: [processor] }));
  configured = { fingerprint, processor };
  void previous?.shutdown();

  return processor;
}

/**
 * Returns null when tracing isn't configured (e.g. a contributor's local
 * .dev.vars with no Langfuse keys set) — callers treat every observation as
 * optional via `?.` so tracing being off never affects the actual response.
 */
export function getTracing(env: Env): Tracing | null {
  const processor = processorFor(env);
  if (!processor) return null;

  const open: Array<{ end(): void }> = [];

  return {
    start(attributes, input) {
      // The attributes have to be in scope as the span is created, not set on
      // it afterwards, which is why both this and `generation` below go
      // through `propagateAttributes` rather than sharing one outer wrapper.
      const root = propagateAttributes(attributes, () =>
        startObservation(attributes.traceName, input === undefined ? {} : { input }),
      );
      open.push(root);

      return {
        root,
        generation(name, generationAttributes) {
          const generation = propagateAttributes(attributes, () =>
            root.startObservation(name, generationAttributes, { asType: 'generation' }),
          );
          open.push(generation);
          return generation;
        },
      };
    },

    async finish() {
      // Ending twice is harmless — OpenTelemetry ignores the second call — so
      // call sites are free to end a generation as soon as it resolves.
      for (const observation of open.splice(0)) observation.end();
      await processor.forceFlush();
    },
  };
}
