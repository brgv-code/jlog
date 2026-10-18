/**
 * The parts of the model catalogue the browser needs: the shape of a model and
 * the effort values a user can pick. Kept apart from `catalogue.ts` so the web
 * bundle does not carry the snapshot it never reads.
 */

export type CatalogueProvider = 'anthropic' | 'openai' | 'gemini';

export type ModelInfo = {
  id: string;
  name: string;
  provider: CatalogueProvider;
  /** YYYY-MM-DD; what "latest" is ordered by. */
  releaseDate: string;
  /** Thinks before answering, so the output cap must cover the thinking too. */
  reasoning: boolean;
  /** Effort values the provider accepts for this model, weakest first. Empty if none. */
  efforts: string[];
  /** Most tokens one answer may use, thinking included. Null when unknown. */
  outputLimit: number | null;
};

/** Weakest to strongest. Every provider's values are a subset of this. */
export const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/** What a user can choose. "default" sends nothing and lets the provider decide. */
export const REASONING_EFFORTS = ['default', 'low', 'medium', 'high'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
