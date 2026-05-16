import { LLMError } from '@jlog/shared';
import type { z } from 'zod';
import type { LLMProvider } from '../index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../prompts/extract-job';

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

export function makeGeminiProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'gemini',
    async extractJSON<T>(prompt: string, schema: z.ZodSchema<T>, content: string): Promise<T> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `${EXTRACT_JOB_SYSTEM_PROMPT}\n\n${prompt}\n\n${content}` }],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });
      } catch (e) {
        throw new LLMError('NETWORK_ERROR', `Gemini request failed: ${String(e)}`);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new LLMError('API_ERROR', `Gemini API error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates[0]?.content?.parts[0]?.text;
      if (!text) {
        throw new LLMError('EMPTY_RESPONSE', 'Gemini returned no content');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new LLMError('PARSE_ERROR', `Failed to parse Gemini response as JSON: ${text}`);
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new LLMError(
          'SCHEMA_ERROR',
          `Gemini response did not match schema: ${result.error.message}`,
        );
      }

      return result.data;
    },
  };
}
