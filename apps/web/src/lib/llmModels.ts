import type { ModelInfo } from '@jlog/shared';
import { apiFetch } from './api';

export type ModelList = {
  models: ModelInfo[];
  /** The newest few, which the dropdown leads with. */
  latest: string[];
  /** Ids this key can call, or null when that could not be checked. */
  available: string[] | null;
};

export async function fetchModels(
  provider: 'anthropic' | 'openai' | 'gemini',
  apiKey?: string,
): Promise<ModelList | null> {
  const res = await apiFetch('/api/llm/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(apiKey ? { provider, apiKey } : { provider }),
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as ModelList;
}

/**
 * "GPT-5 Nano · Aug 2025 · reasoning". A model this key cannot call says so
 * rather than disappearing: provider lists lag, and access arrives late.
 */
export function modelLabel(model: ModelInfo, available: string[] | null): string {
  const parts = [model.name];
  const date = model.releaseDate ? new Date(`${model.releaseDate}T00:00:00Z`) : null;
  if (date && !Number.isNaN(date.getTime())) {
    parts.push(
      date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    );
  }
  if (model.reasoning) parts.push('reasoning');
  if (available && !available.includes(model.id)) parts.push('not on your key');
  return parts.join(' · ');
}

/**
 * The model to preselect when the provider changes: the newest one this key
 * can call, else the newest one, else nothing (the user types an id).
 */
export function defaultModel(list: ModelList): string {
  const usable = list.available
    ? list.latest.find((id) => list.available?.includes(id))
    : undefined;
  return usable ?? list.latest[0] ?? list.models[0]?.id ?? '';
}
