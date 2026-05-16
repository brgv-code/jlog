import { z } from 'zod';

export interface LLMProvider {
  name: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  extractJSON<T>(prompt: string, schema: z.ZodSchema<T>, content: string): Promise<T>;
}

export const extractedJobSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

export type LLMConfig = {
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  apiKey?: string;
  model: string;
  ollamaUrl?: string;
};

export function makeProvider(_config: LLMConfig): LLMProvider {
  // Implemented in Phase 4
  throw new Error('LLM providers not yet implemented');
}
