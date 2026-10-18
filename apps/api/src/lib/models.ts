import type { LLMProviderName, ModelInfo } from '@jlog/shared';
import { bundledCatalogue, readCatalogue } from '@jlog/shared/models';

/**
 * The model catalogue (BRG-232): models.dev live, or the bundled snapshot.
 *
 * Read on the settings page and on every model call, so it must be cheap and
 * must never be the reason a call fails. The edge caches the upstream document
 * for a day, this isolate keeps the parsed result for an hour, and anything
 * that goes wrong on the way serves the snapshot instead.
 */
const SOURCE = 'https://models.dev/api.json';
const ISOLATE_TTL_MS = 60 * 60 * 1000;

let memo: { at: number; models: ModelInfo[]; source: 'live' | 'bundled' } | null = null;

export async function loadCatalogue(): Promise<{
  models: ModelInfo[];
  source: 'live' | 'bundled';
}> {
  if (memo && Date.now() - memo.at < ISOLATE_TTL_MS) return memo;
  let models: ModelInfo[] = [];
  try {
    const res = await fetch(SOURCE, {
      signal: AbortSignal.timeout(5000),
      cf: { cacheTtl: 86_400, cacheEverything: true },
    });
    if (res.ok) models = readCatalogue(await res.json());
  } catch {
    // Offline, blocked, or slow: the snapshot below is the answer.
  }
  memo = models.length
    ? { at: Date.now(), models, source: 'live' }
    : { at: Date.now(), models: bundledCatalogue(), source: 'bundled' };
  return memo;
}

/** What the catalogue knows about one configured model, if anything. Ollama never is. */
export async function lookupModel(
  provider: LLMProviderName,
  model: string,
): Promise<ModelInfo | undefined> {
  if (provider === 'ollama') return undefined;
  const { models } = await loadCatalogue();
  return models.find((m) => m.provider === provider && m.id === model);
}

/** For tests: forget the isolate cache. */
export function resetCatalogueCache(): void {
  memo = null;
}
