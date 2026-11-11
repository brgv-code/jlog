import { z } from 'zod';
import { makeAnthropicProvider } from './providers/anthropic';
import { makeGeminiProvider } from './providers/gemini';
import { makeOllamaProvider } from './providers/ollama';
import { makeOpenAIProvider } from './providers/openai';

export type LLMUsage = { input: number; output: number; reasoning?: number };

export type LLMCallReport = { usage: LLMUsage | null; effortRetried: boolean };

export type ExtractOptions = {
  system?: string;
  maxTokens?: number;
  timeoutMs?: number;
  reasoningEffort?: string;
  onResponse?: (report: LLMCallReport) => void;
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
    location: z
      .string()
      .nullable()
      .optional()
      .transform((v) => (v === '' || v == null ? null : v)),
    confidence: z.coerce.number().min(0).max(1).catch(0.5),
  })
  .passthrough();

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

export const rawJsonSchema: z.ZodType<unknown> = z.unknown();

export type LLMConfig = {
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  apiKey?: string;
  model: string;
  ollamaUrl?: string;
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
export { listModelIds } from './models';
