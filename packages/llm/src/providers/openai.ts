import { LLMError } from '@jlog/shared';
import type { z } from 'zod';
import type { ExtractOptions, LLMProvider } from '../index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../prompts/extract-job';

interface OpenAICompletion {
  choices: Array<{ message: { content: string | null }; finish_reason?: string }>;
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
      try {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(30000),
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
            /*
             * Not `max_tokens`. The reasoning models reject it outright —
             * "Unsupported parameter: 'max_tokens' is not supported with this
             * model. Use 'max_completion_tokens' instead." — and fail the whole
             * request with a 400 rather than ignoring it.
             *
             * `max_completion_tokens` is accepted by the older chat models too,
             * so this is one parameter for both families rather than a
             * model-name lookup that goes stale every time OpenAI ships
             * something.
             *
             * Note it bounds reasoning tokens as well as visible ones on those
             * models, so a budget that is merely enough for the answer can be
             * spent entirely on thinking and return empty content.
             */
            max_completion_tokens: options?.maxTokens ?? 1024,
            response_format: { type: 'json_object' },
          }),
        });
      } catch (e) {
        throw new LLMError('NETWORK_ERROR', `OpenAI request failed: ${String(e)}`);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new LLMError('API_ERROR', `OpenAI API error ${res.status}: ${body}`);
      }

      const data = (await res.json().catch(() => {
        throw new LLMError('PARSE_ERROR', 'OpenAI returned a non-JSON success response');
      })) as OpenAICompletion;
      const choice = data.choices[0];
      const text = choice?.message?.content;
      if (!text) {
        // "no content" on its own sends you looking at the prompt. The usual
        // cause on a reasoning model is the budget being spent on hidden
        // reasoning before any visible token was produced, and `finish_reason`
        // is the only thing that distinguishes that from a genuine refusal.
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
