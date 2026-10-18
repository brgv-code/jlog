/**
 * Which models exist, and how to call each one.
 *
 * Model ids used to be typed by hand, and every call used one output budget per
 * provider. That broke the day a reasoning model was picked: on those, the cap
 * covers hidden reasoning as well as the answer, and 4096 tokens were spent on
 * thinking alone. A budget has to come from the model, so the list the user
 * picks from carries what each model can do.
 *
 * The source is models.dev, an open catalogue of release dates, output limits
 * and reasoning options across providers. It is read live and cached by the
 * API, and a trimmed snapshot ships here so a self-hosted or offline instance
 * still has a list (`scripts/refresh-models.mjs` regenerates it).
 */
import {
  type CatalogueProvider,
  EFFORT_ORDER,
  type ModelInfo,
  type ReasoningEffort,
} from './efforts';
import snapshot from './snapshot.json';

export * from './efforts';

/** models.dev names Google's API "google"; jlog calls the provider "gemini". */
const SOURCE_KEYS: Record<CatalogueProvider, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  gemini: 'google',
};

type SourceModel = {
  id?: unknown;
  name?: unknown;
  release_date?: unknown;
  reasoning?: unknown;
  reasoning_options?: unknown;
  structured_output?: unknown;
  tool_call?: unknown;
  limit?: { output?: unknown } | null;
  modalities?: { output?: unknown } | null;
};

const NOT_TEXT = new Set(['image', 'audio', 'video']);

/**
 * Only models that can do jlog's work: text out, nothing else out, and JSON
 * in some form. Moving aliases ("-latest") are left out: they change under the
 * user without the setting changing, which is the opposite of picking a model.
 */
function usable(m: SourceModel): m is SourceModel & { id: string } {
  if (typeof m.id !== 'string' || m.id.endsWith('-latest')) return false;
  const out = Array.isArray(m.modalities?.output) ? (m.modalities.output as unknown[]) : [];
  if (!out.includes('text') || out.some((o) => typeof o === 'string' && NOT_TEXT.has(o))) {
    return false;
  }
  return m.structured_output === true || m.tool_call === true;
}

function effortsOf(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const effort = options.find(
    (o): o is { type: 'effort'; values: unknown[] } =>
      typeof o === 'object' && o !== null && (o as { type?: unknown }).type === 'effort',
  );
  const values = Array.isArray(effort?.values)
    ? effort.values.filter((v): v is string => typeof v === 'string')
    : [];
  const rank = (v: string) => EFFORT_ORDER.indexOf(v as (typeof EFFORT_ORDER)[number]);
  return values.filter((v) => rank(v) !== -1).sort((a, b) => rank(a) - rank(b));
}

/** Read the models.dev document (or the snapshot, which has its shape) into ModelInfo. */
export function readCatalogue(source: unknown): ModelInfo[] {
  if (typeof source !== 'object' || source === null) return [];
  const out: ModelInfo[] = [];
  for (const [provider, key] of Object.entries(SOURCE_KEYS) as [CatalogueProvider, string][]) {
    const models = (source as Record<string, { models?: Record<string, SourceModel> }>)[key]
      ?.models;
    for (const m of Object.values(models ?? {})) {
      if (!usable(m)) continue;
      const limit = m.limit?.output;
      out.push({
        id: m.id,
        name: typeof m.name === 'string' ? m.name : m.id,
        provider,
        releaseDate: typeof m.release_date === 'string' ? m.release_date : '',
        reasoning: m.reasoning === true,
        efforts: effortsOf(m.reasoning_options),
        outputLimit: typeof limit === 'number' && limit > 0 ? limit : null,
      });
    }
  }
  return out;
}

/** The bundled copy, for when the live catalogue cannot be fetched. */
export function bundledCatalogue(): ModelInfo[] {
  return readCatalogue(snapshot);
}

/** One provider's models, newest first; ties by id so the order is stable. */
export function modelsFor(catalogue: ModelInfo[], provider: CatalogueProvider): ModelInfo[] {
  return catalogue
    .filter((m) => m.provider === provider)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.id.localeCompare(b.id));
}

/**
 * Output cap for one call. Reasoning models get room to think and still
 * answer; others need only the answer. Never above what the model allows.
 * An unknown model (a custom id, a model newer than the catalogue) gets the
 * caller's fallback, which is what every call used before there was a list.
 */
export function budgetFor(info: ModelInfo | undefined, fallback: number): number {
  if (!info) return fallback;
  const want = info.reasoning ? 32_768 : 8192;
  return info.outputLimit ? Math.min(want, info.outputLimit) : want;
}

/**
 * The effort to send, or undefined to send none. The user picks low, medium or
 * high; a model that does not offer that value gets the nearest one it does,
 * preferring the weaker side, since the setting is mostly chosen to save time.
 */
export function effortFor(
  info: ModelInfo | undefined,
  wanted: ReasoningEffort | null | undefined,
): string | undefined {
  if (!info?.reasoning || !wanted || wanted === 'default' || !info.efforts.length) return undefined;
  if (info.efforts.includes(wanted)) return wanted;
  const rank = (v: string) => EFFORT_ORDER.indexOf(v as (typeof EFFORT_ORDER)[number]);
  const target = rank(wanted);
  return [...info.efforts].sort(
    (a, b) => Math.abs(rank(a) - target) - Math.abs(rank(b) - target) || rank(a) - rank(b),
  )[0];
}
