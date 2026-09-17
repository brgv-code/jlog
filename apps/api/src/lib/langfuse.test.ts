import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../index';
import { getTracing } from './langfuse';

type ExportedSpan = {
  name: string;
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  attributes: Array<{ key: string; value: Record<string, unknown> }>;
};

/**
 * Langfuse applies the propagated attributes in its span processor's `onStart`,
 * so a test that swaps in its own exporter would never see them. This reads
 * what actually went over the wire instead — the same OTLP payload the real
 * project would receive.
 */
let received: ExportedSpan[] = [];
let baseUrl = '';

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    for (const resourceSpan of JSON.parse(body).resourceSpans ?? []) {
      for (const scopeSpan of resourceSpan.scopeSpans ?? []) received.push(...scopeSpan.spans);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
});

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    }),
);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  received = [];
});

const envWithKeys = () =>
  ({
    LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
    LANGFUSE_SECRET_KEY: 'sk-lf-test',
    LANGFUSE_BASE_URL: baseUrl,
  }) as unknown as Env;

const tracingOrThrow = () => {
  const tracing = getTracing(envWithKeys());
  if (!tracing) throw new Error('expected tracing to be configured');
  return tracing;
};

const spanNamed = (name: string) => {
  const span = received.find((candidate) => candidate.name === name);
  if (!span) throw new Error(`no exported span named ${name}, got: ${received.map((s) => s.name)}`);
  return span;
};

const attribute = (span: ExportedSpan, key: string) => {
  const value = span.attributes.find((a) => a.key === key)?.value;
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue as string;
  if ('arrayValue' in value) {
    const array = value.arrayValue as { values: Array<{ stringValue: string }> };
    return array.values.map((entry) => entry.stringValue);
  }
  return value;
};

describe('getTracing', () => {
  it('hangs the generation off the root observation', async () => {
    const tracing = tracingOrThrow();
    const traced = tracing.start({ traceName: 'extract-job' }, { url: 'https://example.com' });
    traced.generation('extract-job-llm-call', { model: 'llama3' });
    await tracing.finish();

    const root = spanNamed('extract-job');
    const generation = spanNamed('extract-job-llm-call');
    expect(generation.parentSpanId).toBe(root.spanId);
    expect(generation.traceId).toBe(root.traceId);
  });

  it('puts the overall input and output on the root observation', async () => {
    const tracing = tracingOrThrow();
    const traced = tracing.start({ traceName: 'extract-job' }, { url: 'https://example.com' });
    traced.root.update({ output: { company: 'Acme' } });
    await tracing.finish();

    const root = spanNamed('extract-job');
    expect(attribute(root, 'langfuse.observation.input')).toContain('https://example.com');
    expect(attribute(root, 'langfuse.observation.output')).toContain('Acme');
    // Trace-level input/output is deprecated in v5 — the root observation is
    // what evaluators read now, so nothing should still write the old keys.
    expect(attribute(root, 'langfuse.trace.input')).toBeUndefined();
    expect(attribute(root, 'langfuse.trace.output')).toBeUndefined();
  });

  it('repeats the correlating attributes onto the cost-bearing generation', async () => {
    const tracing = tracingOrThrow();
    const traced = tracing.start({
      traceName: 'tailor-cv',
      userId: 'user-1',
      sessionId: 'session-1',
      tags: ['tailoring', 'ollama'],
      metadata: { provider: 'ollama' },
    });
    traced.generation('tailor', { model: 'llama3' });
    await tracing.finish();

    // A generation is what costs money, so it has to be filterable by user,
    // session and tag on its own — not only through its parent.
    for (const span of [spanNamed('tailor-cv'), spanNamed('tailor')]) {
      expect(attribute(span, 'user.id')).toBe('user-1');
      expect(attribute(span, 'session.id')).toBe('session-1');
      expect(attribute(span, 'langfuse.trace.tags')).toEqual(['tailoring', 'ollama']);
      expect(attribute(span, 'langfuse.trace.metadata.provider')).toBe('ollama');
    }
  });

  it('closes observations the call site left open', async () => {
    const tracing = tracingOrThrow();
    // `makeJsonCaller` returns a closure that outlives its own frame, so the
    // root is routinely still open when the request ends.
    tracing.start({ traceName: 'import-cv' });
    await tracing.finish();

    expect(spanNamed('import-cv').name).toBe('import-cv');
  });

  it('is off when the keys are unset, so a local run traces nothing', () => {
    expect(getTracing({} as Env)).toBeNull();
  });
});
