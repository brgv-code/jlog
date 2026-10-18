import { LLMError } from '@jlog/shared';
import type { z } from 'zod';
import type { ExtractOptions, LLMProvider } from '../index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../prompts/extract-job';
import { sendWithEffort } from './effort';

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string; thought?: boolean }> };
  }>;
}

export function makeGeminiProvider(apiKey: string, model: string): LLMProvider {
  return {
    name: 'gemini',
    async extractJSON<T>(
      prompt: string,
      schema: z.ZodSchema<T>,
      content: string,
      options?: ExtractOptions,
    ): Promise<T> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      let res: Response;
      try {
        const send = (effort: string | undefined) =>
          fetch(url, {
            method: 'POST',
            signal: AbortSignal.timeout(options?.timeoutMs ?? 30000),
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `${options?.system ?? EXTRACT_JOB_SYSTEM_PROMPT}\n\n${prompt}\n\n${content}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: 'application/json',
                ...(effort ? { thinkingConfig: { thinkingLevel: effort } } : {}),
              },
            }),
          });
        res = await sendWithEffort(send, options?.reasoningEffort);
      } catch (e) {
        throw new LLMError('NETWORK_ERROR', `Gemini request failed: ${String(e)}`);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new LLMError('API_ERROR', `Gemini API error ${res.status}: ${body}`);
      }

      const data = (await res.json().catch(() => {
        throw new LLMError('PARSE_ERROR', 'Gemini returned a non-JSON success response');
      })) as GeminiResponse;
      // Thought summaries arrive as parts marked `thought`; the answer is the rest.
      const text = data.candidates[0]?.content?.parts.find((part) => !part.thought)?.text;
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
