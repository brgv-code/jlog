import { LLMError } from '@jlog/shared';

/**
 * The model ids an API key can actually call, from the provider's own list.
 *
 * The catalogue says which models exist and what they can do; only the provider
 * knows which of them this key may use. A model missing here is shown as not
 * available rather than hidden: lists lag, keys get access late, and the user
 * may know better.
 */
export async function listModelIds(
  provider: 'anthropic' | 'openai' | 'gemini',
  apiKey: string,
): Promise<string[]> {
  const signal = AbortSignal.timeout(10_000);
  let res: Response;
  try {
    res =
      provider === 'openai'
        ? await fetch('https://api.openai.com/v1/models', {
            signal,
            headers: { Authorization: `Bearer ${apiKey}` },
          })
        : provider === 'anthropic'
          ? await fetch('https://api.anthropic.com/v1/models?limit=1000', {
              signal,
              headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            })
          : await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
              { signal },
            );
  } catch (e) {
    throw new LLMError('NETWORK_ERROR', `Could not list ${provider} models: ${String(e)}`);
  }
  if (!res.ok) {
    throw new LLMError('API_ERROR', `Listing ${provider} models failed with ${res.status}`);
  }

  const body = (await res.json().catch(() => null)) as {
    data?: { id?: unknown }[];
    models?: { name?: unknown }[];
  } | null;
  const ids =
    provider === 'gemini'
      ? (body?.models ?? []).map((m) =>
          typeof m.name === 'string' ? m.name.replace(/^models\//, '') : '',
        )
      : (body?.data ?? []).map((m) => (typeof m.id === 'string' ? m.id : ''));
  return ids.filter(Boolean);
}
