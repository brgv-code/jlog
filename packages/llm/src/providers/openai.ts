import { LLMError } from '@jlog/shared';
import type { z } from 'zod';
import type { ExtractOptions, LLMProvider, LLMUsage } from '../index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../prompts/extract-job';
import { sendWithEffort } from './effort';

interface OpenAICompletion {
  choices: Array<{ message: { content: string | null }; finish_reason?: string }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

export function makeOpenAIProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'openai',
    async extractJSON<T>(
      prompt: string,
      schema: z.ZodSchema<T>,
      content: string,
      options?: ExtractOptions,
    ): Promise<T> {
      let res: Response;
      let effortRetried = false;
      try {
        const send = (effort: string | undefined) =>
          fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(options?.timeoutMs ?? 30000),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: options?.system ?? EXTRACT_JOB_SYSTEM_PROMPT },
                { role: 'user', content: `${prompt}\n\n${content}` },
              ],
              max_completion_tokens: options?.maxTokens ?? 1024,
              response_format: { type: 'json_object' },
              ...(effort ? { reasoning_effort: effort } : {}),
            }),
          });
        ({ response: res, effortRetried } = await sendWithEffort(send, options?.reasoningEffort));
      } catch (e) {
        throw new LLMError('NETWORK_ERROR', `OpenAI request failed: ${String(e)}`);
      }

      if (!res.ok) {
        options?.onResponse?.({ usage: null, effortRetried });
        const body = await res.text().catch(() => '');
        throw new LLMError('API_ERROR', `OpenAI API error ${res.status}: ${body}`);
      }

      const data = (await res.json().catch(() => {
        throw new LLMError('PARSE_ERROR', 'OpenAI returned a non-JSON success response');
      })) as OpenAICompletion;
      options?.onResponse?.({ usage: openAIUsage(data.usage), effortRetried });
      const choice = data.choices[0];
      const text = choice?.message?.content;
      if (!text) {
        const budget = options?.maxTokens ?? 1024;
        throw new LLMError(
          'EMPTY_RESPONSE',
          choice?.finish_reason === 'length'
            ? `OpenAI stopped at the token limit before producing any content. On a reasoning model max_completion_tokens (${budget}) covers reasoning as well as the answer, so it has to be larger than the answer alone.`
            : `OpenAI returned no content (finish_reason: ${choice?.finish_reason ?? 'unknown'})`,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new LLMError('PARSE_ERROR', `Failed to parse OpenAI response as JSON: ${text}`);
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new LLMError(
          'SCHEMA_ERROR',
          `OpenAI response did not match schema: ${result.error.message}`,
        );
      }

      return result.data;
    },
  };
}

function openAIUsage(usage: OpenAICompletion['usage']): LLMUsage | null {
  if (!usage) return null;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  return {
    input: usage.prompt_tokens,
    output: usage.completion_tokens,
    ...(reasoning ? { reasoning } : {}),
  };
}
