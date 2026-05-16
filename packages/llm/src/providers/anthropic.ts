import { LLMError } from '@jlog/shared';
import type { z } from 'zod';
import type { LLMProvider } from '../index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../prompts/extract-job';

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>;
}

export function makeAnthropicProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'anthropic',
    async extractJSON<T>(prompt: string, schema: z.ZodSchema<T>, content: string): Promise<T> {
      let res: Response;
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: EXTRACT_JOB_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `${prompt}\n\n${content}` }],
          }),
        });
      } catch (e) {
        throw new LLMError('NETWORK_ERROR', `Anthropic request failed: ${String(e)}`);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new LLMError('API_ERROR', `Anthropic API error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as AnthropicMessage;
      const text = data.content[0]?.text;
      if (!text) {
        throw new LLMError('EMPTY_RESPONSE', 'Anthropic returned no content');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new LLMError('PARSE_ERROR', `Failed to parse Anthropic response as JSON: ${text}`);
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new LLMError(
          'SCHEMA_ERROR',
          `Anthropic response did not match schema: ${result.error.message}`,
        );
      }

      return result.data;
    },
  };
}
