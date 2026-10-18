import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalogue, lookupModel, resetCatalogueCache } from './models';

const live = {
  openai: {
    models: {
      x: {
        id: 'gpt-live',
        name: 'GPT Live',
        release_date: '2026-10-01',
        reasoning: true,
        structured_output: true,
        limit: { output: 64000 },
        modalities: { output: ['text'] },
      },
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetCatalogueCache();
});

describe('loadCatalogue', () => {
  it('reads models.dev when it answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(live))),
    );
    const { models, source } = await loadCatalogue();
    expect(source).toBe('live');
    expect(models.map((m) => m.id)).toEqual(['gpt-live']);
  });

  // The settings page and every model call read this; an unreachable catalogue
  // must cost freshness, never the call.
  it('serves the bundled snapshot when models.dev cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const { models, source } = await loadCatalogue();
    expect(source).toBe('bundled');
    expect(models.length).toBeGreaterThan(20);
  });

  it('asks upstream once per isolate, not once per call', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(live)));
    vi.stubGlobal('fetch', fetchMock);
    await loadCatalogue();
    await lookupModel('openai', 'gpt-live');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('knows nothing about Ollama models, which run wherever the user put them', async () => {
    expect(await lookupModel('ollama', 'llama3')).toBeUndefined();
  });
});
