import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { makeAnthropicProvider } from './anthropic';
import { makeGeminiProvider } from './gemini';
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

const sent = (fn: ReturnType<typeof mockFetch>, call = 0) =>
  JSON.parse(String(fn.mock.calls[call]?.[1]?.body)) as Record<string, unknown>;

const openaiOk = { choices: [{ message: { content: '{"ok":true}' } }] };

afterEach(() => vi.unstubAllGlobals());

describe('reasoning effort', () => {
  it('goes out in each provider’s own field', async () => {
    let fn = mockFetch([openaiOk, 200]);
    await makeOpenAIProvider('k', 'gpt-5-nano').extractJSON('p', schema, 'c', {
      reasoningEffort: 'low',
    });
    expect(sent(fn).reasoning_effort).toBe('low');

    fn = mockFetch([{ content: [{ type: 'text', text: '{"ok":true}' }] }, 200]);
    await makeAnthropicProvider('k', 'claude-haiku-5-5').extractJSON('p', schema, 'c', {
      reasoningEffort: 'low',
    });
    expect(sent(fn).output_config).toEqual({ effort: 'low' });

    fn = mockFetch([{ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }, 200]);
    await makeGeminiProvider('k', 'gemini-3.8-flash').extractJSON('p', schema, 'c', {
      reasoningEffort: 'low',
    });
    expect((sent(fn).generationConfig as Record<string, unknown>).thinkingConfig).toEqual({
      thinkingLevel: 'low',
    });
  });

  it('sends nothing when no effort is set', async () => {
    const fn = mockFetch([openaiOk, 200]);
    await makeOpenAIProvider('k', 'gpt-4o-mini').extractJSON('p', schema, 'c');
    expect(sent(fn)).not.toHaveProperty('reasoning_effort');
  });

  // The catalogue can be a release behind the provider. A setting meant to save
  // time must not be what fails the call.
  it('retries once without the effort when the provider rejects that field', async () => {
    const fn = mockFetch(
      [{ error: { message: "Unsupported parameter: 'reasoning_effort'" } }, 400],
      [openaiOk, 200],
    );
    const out = await makeOpenAIProvider('k', 'gpt-4o-mini').extractJSON('p', schema, 'c', {
      reasoningEffort: 'low',
    });
    expect(out).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sent(fn, 1)).not.toHaveProperty('reasoning_effort');
  });

  it('does not retry a 400 about something else', async () => {
    const fn = mockFetch([{ error: { message: 'Invalid API key' } }, 400]);
    await expect(
      makeOpenAIProvider('k', 'gpt-5-nano').extractJSON('p', schema, 'c', {
        reasoningEffort: 'low',
      }),
    ).rejects.toThrow(/400/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reads the answer past thinking blocks and thought parts', async () => {
    mockFetch([
      {
        content: [
          { type: 'thinking', thinking: 'hm' },
          { type: 'text', text: '{"ok":true}' },
        ],
      },
      200,
    ]);
    await expect(
      makeAnthropicProvider('k', 'claude-opus-5-5').extractJSON('p', schema, 'c'),
    ).resolves.toEqual({ ok: true });

    mockFetch([
      {
        candidates: [
          { content: { parts: [{ text: 'thinking', thought: true }, { text: '{"ok":true}' }] } },
        ],
      },
      200,
    ]);
    await expect(
      makeGeminiProvider('k', 'gemini-3.8-flash').extractJSON('p', schema, 'c'),
    ).resolves.toEqual({ ok: true });
  });
});
