import { LLMError } from '@jlog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { makeOpenAIProvider } from './openai';

/**
 * The request body, not the model's answer.
 *
 * These assertions exist because the failure they cover is invisible to a type
 * checker and to every test that mocks at a higher level: a parameter name the
 * API rejects. It cost a live 400 on the tailoring path once.
 */

const schema = z.object({ ok: z.boolean() });

type FetchMock = ReturnType<typeof mockOpenAI>;

function mockOpenAI(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** What actually went over the wire, which is the whole point of these tests. */
function sentBody(fetchMock: FetchMock): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body));
}

const completion = (content: string | null, finish_reason?: string) => ({
  choices: [{ message: { content }, ...(finish_reason ? { finish_reason } : {}) }],
});

afterEach(() => vi.unstubAllGlobals());

describe('makeOpenAIProvider', () => {
  it('sends max_completion_tokens and never max_tokens', async () => {
    const fetchMock = mockOpenAI(completion('{"ok":true}'));
    await makeOpenAIProvider('sk-test', 'gpt-4o-mini').extractJSON('p', schema, 'c', {
      maxTokens: 4096,
    });

    const sent = sentBody(fetchMock);
    expect(sent.max_completion_tokens).toBe(4096);
    // The reasoning models 400 on this one rather than ignoring it, which
    // fails the whole request.
    expect(sent).not.toHaveProperty('max_tokens');
  });

  it('defaults the budget when the caller does not set one', async () => {
    const fetchMock = mockOpenAI(completion('{"ok":true}'));
    await makeOpenAIProvider('sk-test', 'gpt-4o-mini').extractJSON('p', schema, 'c');

    const sent = sentBody(fetchMock);
    expect(sent.max_completion_tokens).toBe(1024);
  });

  // A reasoning model can spend the whole budget thinking and return nothing
  // visible. "no content" alone sends you looking at the prompt instead.
  it('says so when the budget ran out before any content existed', async () => {
    mockOpenAI(completion(null, 'length'));

    const err = await makeOpenAIProvider('sk-test', 'o4-mini')
      .extractJSON('p', schema, 'c', { maxTokens: 64 })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LLMError);
    expect((err as LLMError).message).toContain('token limit');
    expect((err as LLMError).message).toContain('64');
  });

  it('reports the finish reason when content is empty for another reason', async () => {
    mockOpenAI(completion(null, 'content_filter'));

    const err = await makeOpenAIProvider('sk-test', 'gpt-4o-mini')
      .extractJSON('p', schema, 'c')
      .catch((e: unknown) => e);

    expect((err as LLMError).message).toContain('content_filter');
  });

  it('passes the provider message through on a rejected request', async () => {
    mockOpenAI({ error: { message: "Unsupported parameter: 'max_tokens'" } }, 400);

    const err = await makeOpenAIProvider('sk-test', 'o4-mini')
      .extractJSON('p', schema, 'c')
      .catch((e: unknown) => e);

    expect((err as LLMError).message).toContain('400');
    expect((err as LLMError).message).toContain('Unsupported parameter');
  });
});
