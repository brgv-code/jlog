import { z } from 'zod';
import { makeAnthropicProvider } from './providers/anthropic';
import { makeGeminiProvider } from './providers/gemini';
import { makeOllamaProvider } from './providers/ollama';
import { makeOpenAIProvider } from './providers/openai';

export interface LLMProvider {
  name: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  extractJSON<T>(prompt: string, schema: z.ZodSchema<T>, content: string): Promise<T>;
}

export const extractedJobSchema = z
  .object({
    company: z.string(),
    role: z.string(),
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
      return makeOllamaProvider(config.model, config.ollamaUrl ?? 'http://localhost:11434', config.extraHeaders);
  }
}

export { makeAnthropicProvider } from './providers/anthropic';
export { makeGeminiProvider } from './providers/gemini';
export { makeOllamaProvider } from './providers/ollama';
export { makeOpenAIProvider } from './providers/openai';
export { EXTRACT_JOB_SYSTEM_PROMPT } from './prompts/extract-job';
