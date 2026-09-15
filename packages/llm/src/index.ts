import { z } from 'zod';
import { makeAnthropicProvider } from './providers/anthropic';
import { makeGeminiProvider } from './providers/gemini';
import { makeOllamaProvider } from './providers/ollama';
import { makeOpenAIProvider } from './providers/openai';

/**
 * Per-call overrides. Without these every caller inherits the job-extraction
 * system prompt, which silently instructs the model to answer a different
 * question than the one being asked.
 */
export type ExtractOptions = {
  /** Replaces EXTRACT_JOB_SYSTEM_PROMPT. Omit to keep extraction behaviour. */
  system?: string;
  /** Output cap. Extraction needs very little; other tasks need more. */
  maxTokens?: number;
};

export interface LLMProvider {
  name: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  extractJSON<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    content: string,
    options?: ExtractOptions,
  ): Promise<T>;
}

export const extractedJobSchema = z
  .object({
    // Some models return null when uncertain — normalise to empty string; caller checks for empty
    company: z
      .string()
      .nullable()
      .catch(null)
      .transform((v) => v ?? ''),
    role: z
      .string()
      .nullable()
      .catch(null)
      .transform((v) => v ?? ''),
    // Local models often return "" instead of null — normalise to null
    location: z
      .string()
      .nullable()
      .optional()
      .transform((v) => (v === '' || v == null ? null : v)),
    // Local models sometimes return confidence as a string — coerce it
    confidence: z.coerce.number().min(0).max(1).catch(0.5),
  })
  .passthrough();

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

/**
 * For callers that validate the model's response themselves. `extractJSON`
 * requires a schema, but a caller whose contract lives elsewhere (the pro
 * tailoring agent checks its own shape) would otherwise have to restate that
 * contract here just to satisfy the signature — and then keep two copies in
 * step. This lets the JSON through and leaves the checking where it belongs.
 */
export const rawJsonSchema: z.ZodType<unknown> = z.unknown();

export type LLMConfig = {
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  apiKey?: string;
  model: string;
  ollamaUrl?: string;
  // Extra headers forwarded to the provider — used for Cloudflare Access service token auth
  extraHeaders?: Record<string, string>;
};

export function makeProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return makeAnthropicProvider(config.apiKey ?? '', config.model);
    case 'openai':
      return makeOpenAIProvider(config.apiKey ?? '', config.model);
    case 'gemini':
      return makeGeminiProvider(config.apiKey ?? '', config.model);
    case 'ollama':
      return makeOllamaProvider(
        config.model,
        config.ollamaUrl ?? 'http://localhost:11434',
        config.extraHeaders,
      );
  }
}

export { makeAnthropicProvider } from './providers/anthropic';
export { makeGeminiProvider } from './providers/gemini';
export { makeOllamaProvider } from './providers/ollama';
export { makeOpenAIProvider } from './providers/openai';
export { EXTRACT_JOB_SYSTEM_PROMPT } from './prompts/extract-job';
