import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { LLMCallReport } from '../index';
import { makeAnthropicProvider } from './anthropic';
import { makeGeminiProvider } from './gemini';
import { makeOllamaProvider } from './ollama';
import { makeOpenAIProvider } from './openai';

const schema = z.object({ ok: z.boolean() });

function mockFetch(...responses: [unknown, number][]) {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const [body, status] = responses.shift() ?? [{}, 500];
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function recorder() {
  const reports: LLMCallReport[] = [];
  return { reports, onResponse: (report: LLMCallReport) => reports.push(report) };
}

afterEach(() => vi.unstubAllGlobals());

describe('usage reporting', () => {
  it('reads Anthropic usage', async () => {
    mockFetch([
      {
        content: [{ type: 'text', text: '{"ok":true}' }],
        usage: { input_tokens: 1200, output_tokens: 40 },
      },
      200,
    ]);
    const { reports, onResponse } = recorder();
    await makeAnthropicProvider('k', 'claude-haiku-5-5').extractJSON('p', schema, 'c', {
      onResponse,
    });
    expect(reports).toEqual([{ usage: { input: 1200, output: 40 }, effortRetried: false }]);
  });

  it('reads OpenAI usage with reasoning tokens', async () => {
    mockFetch([
      {
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: {
          prompt_tokens: 900,
          completion_tokens: 300,
          completion_tokens_details: { reasoning_tokens: 256 },
        },
      },
      200,
    ]);
    const { reports, onResponse } = recorder();
    await makeOpenAIProvider('k', 'gpt-5-nano').extractJSON('p', schema, 'c', { onResponse });
    expect(reports[0]?.usage).toEqual({ input: 900, output: 300, reasoning: 256 });
  });

  it('counts Gemini thinking as output, since it is billed as output', async () => {
    mockFetch([
      {
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 30, thoughtsTokenCount: 500 },
      },
      200,
    ]);
    const { reports, onResponse } = recorder();
    await makeGeminiProvider('k', 'gemini-3.8-flash').extractJSON('p', schema, 'c', {
      onResponse,
    });
    expect(reports[0]?.usage).toEqual({ input: 800, output: 530, reasoning: 500 });
  });

  it('reads Ollama usage', async () => {
    mockFetch([{ response: '{"ok":true}', prompt_eval_count: 700, eval_count: 25 }, 200]);
    const { reports, onResponse } = recorder();
    await makeOllamaProvider('llama3', 'http://localhost:11434').extractJSON('p', schema, 'c', {
      onResponse,
    });
    expect(reports[0]?.usage).toEqual({ input: 700, output: 25 });
  });

  it('reports no usage when the provider sends none', async () => {
    mockFetch([{ choices: [{ message: { content: '{"ok":true}' } }] }, 200]);
    const { reports, onResponse } = recorder();
    await makeOpenAIProvider('k', 'gpt-4o-mini').extractJSON('p', schema, 'c', { onResponse });
    expect(reports).toEqual([{ usage: null, effortRetried: false }]);
  });

  it('reports usage even when the budget ran out before any answer', async () => {
    mockFetch([
      {
        choices: [{ message: { content: null }, finish_reason: 'length' }],
        usage: { prompt_tokens: 900, completion_tokens: 1024 },
      },
      200,
    ]);
    const { reports, onResponse } = recorder();
    await expect(
      makeOpenAIProvider('k', 'gpt-5-nano').extractJSON('p', schema, 'c', { onResponse }),
    ).rejects.toThrow(/token limit/);
    expect(reports[0]?.usage).toEqual({ input: 900, output: 1024 });
  });

  it('says when the effort was dropped and the request sent twice', async () => {
    mockFetch(
      [{ error: { message: "Unsupported parameter: 'reasoning_effort'" } }, 400],
      [{ choices: [{ message: { content: '{"ok":true}' } }] }, 200],
    );
    const { reports, onResponse } = recorder();
    await makeOpenAIProvider('k', 'gpt-4o-mini').extractJSON('p', schema, 'c', {
      reasoningEffort: 'low',
      onResponse,
    });
    expect(reports[0]?.effortRetried).toBe(true);
  });

  it('reports a failed request too, so the retry is not lost with it', async () => {
    mockFetch(
      [{ error: { message: "Unsupported parameter: 'reasoning_effort'" } }, 400],
      [{ error: { message: 'overloaded' } }, 529],
    );
    const { reports, onResponse } = recorder();
    await expect(
      makeAnthropicProvider('k', 'claude-haiku-5-5').extractJSON('p', schema, 'c', {
        reasoningEffort: 'low',
        onResponse,
      }),
    ).rejects.toThrow(/529/);
    expect(reports).toEqual([{ usage: null, effortRetried: true }]);
  });
});
