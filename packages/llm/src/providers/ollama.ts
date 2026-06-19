import { LLMError } from '@jlog/shared';
import type { z } from 'zod';
import type { LLMProvider } from '../index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../prompts/extract-job';

interface OllamaResponse {
  response: string;
}

export function makeOllamaProvider(
  model: string,
  ollamaUrl: string,
  extraHeaders?: Record<string, string>,
): LLMProvider {
  return {
    name: 'ollama',
    async extractJSON<T>(prompt: string, schema: z.ZodSchema<T>, content: string): Promise<T> {
      const url = `${ollamaUrl}/api/generate`;

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          signal: AbortSignal.timeout(60000),
          headers: { 'content-type': 'application/json', ...extraHeaders },
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

      const rawText = await res.text();
      let data: OllamaResponse;
      try {
        data = JSON.parse(rawText) as OllamaResponse;
      } catch {
        throw new LLMError(
          'PARSE_ERROR',
          `Ollama returned non-JSON (got HTML?): ${rawText.slice(0, 200)}`,
        );
      }
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
