import { LLMError } from '@jlog/shared';
import type { z } from 'zod';
import type { LLMProvider } from '../index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../prompts/extract-job';

interface OpenAICompletion {
  choices: Array<{ message: { content: string | null } }>;
}

export function makeOpenAIProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'openai',
    async extractJSON<T>(prompt: string, schema: z.ZodSchema<T>, content: string): Promise<T> {
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
              { role: 'system', content: EXTRACT_JOB_SYSTEM_PROMPT },
              { role: 'user', content: `${prompt}\n\n${content}` },
            ],
            max_tokens: 1024,
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

      const data = await res.json().catch(() => {
        throw new LLMError('PARSE_ERROR', 'OpenAI returned a non-JSON success response');
      }) as OpenAICompletion;
      const text = data.choices[0]?.message?.content;
      if (!text) {
        throw new LLMError('EMPTY_RESPONSE', 'OpenAI returned no content');
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
