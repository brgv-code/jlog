import { LLMError } from '@jlog/shared';
import type { z } from 'zod';
import type { LLMProvider } from '../index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../prompts/extract-job';

interface OllamaResponse {
  response: string;
}

export function makeOllamaProvider(model: string, ollamaUrl: string): LLMProvider {
  return {
    name: 'ollama',
    async extractJSON<T>(prompt: string, schema: z.ZodSchema<T>, content: string): Promise<T> {
      const url = `${ollamaUrl}/api/generate`;

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: `${EXTRACT_JOB_SYSTEM_PROMPT}\n\n${prompt}\n\n${content}`,
            stream: false,
            format: 'json',
          }),
        });
      } catch (e) {
        throw new LLMError(
          'NETWORK_ERROR',
          `Ollama request failed — is Ollama running at ${ollamaUrl}? Error: ${String(e)}`,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new LLMError('API_ERROR', `Ollama API error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as OllamaResponse;
      const text = data.response;
      if (!text) {
        throw new LLMError('EMPTY_RESPONSE', 'Ollama returned no content');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new LLMError('PARSE_ERROR', `Failed to parse Ollama response as JSON: ${text}`);
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        console.error('[ollama] raw response:', JSON.stringify(parsed));
        console.error('[ollama] schema errors:', result.error.message);
        throw new LLMError(
          'SCHEMA_ERROR',
          `Ollama response did not match schema: ${result.error.message} | raw: ${JSON.stringify(parsed)}`,
        );
      }

      return result.data;
    },
  };
}
