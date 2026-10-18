import { describe, expect, it } from 'vitest';
import {
  type ModelInfo,
  budgetFor,
  bundledCatalogue,
  effortFor,
  modelsFor,
  readCatalogue,
} from './catalogue';

const model = (over: Record<string, unknown>) => ({
  id: 'm',
  name: 'M',
  release_date: '2026-01-01',
  reasoning: false,
  structured_output: true,
  limit: { output: 16000 },
  modalities: { output: ['text'] },
  ...over,
});

const source = {
  openai: {
    models: {
      a: model({ id: 'gpt-old', release_date: '2025-01-01' }),
      b: model({
        id: 'gpt-new',
        release_date: '2026-09-01',
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['high', 'minimal', 'low', 'medium'] }],
        limit: { output: 128000 },
      }),
      c: model({ id: 'gpt-image', modalities: { output: ['image', 'text'] } }),
      d: model({ id: 'gpt-flagship-latest' }),
      e: model({ id: 'embed', structured_output: false, tool_call: false }),
    },
  },
  google: { models: { g: model({ id: 'gemini-x' }) } },
  mistral: { models: { z: model({ id: 'not-ours' }) } },
};

describe('readCatalogue', () => {
  const catalogue = readCatalogue(source);

  it('keeps text models that can return JSON, and only from providers jlog calls', () => {
    expect(catalogue.map((m) => m.id).sort()).toEqual(['gemini-x', 'gpt-new', 'gpt-old']);
  });

  it('names Google gemini, and orders effort values weakest first', () => {
    expect(catalogue.find((m) => m.id === 'gemini-x')?.provider).toBe('gemini');
    expect(catalogue.find((m) => m.id === 'gpt-new')?.efforts).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
    ]);
  });

  it('lists a provider newest first', () => {
    expect(modelsFor(catalogue, 'openai').map((m) => m.id)).toEqual(['gpt-new', 'gpt-old']);
  });

  it('survives garbage', () => {
    expect(readCatalogue(null)).toEqual([]);
    expect(readCatalogue({ openai: { models: { x: { id: 3 } } } })).toEqual([]);
  });
});

describe('the bundled snapshot', () => {
  // The fallback a self-hosted instance serves. If it reads as empty, the
  // settings dropdown silently has nothing to offer.
  it('has models for every provider jlog calls', () => {
    const catalogue = bundledCatalogue();
    for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
      expect(modelsFor(catalogue, provider).length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('budgetFor', () => {
  const info = (over: Partial<ModelInfo>): ModelInfo => ({
    id: 'm',
    name: 'M',
    provider: 'openai',
    releaseDate: '',
    reasoning: false,
    efforts: [],
    outputLimit: 128000,
    ...over,
  });

  // The failure this exists for: 4096 on gpt-5-nano was spent on reasoning
  // and no answer came back.
  it('gives a reasoning model room to think and still answer', () => {
    expect(budgetFor(info({ reasoning: true }), 4096)).toBe(32768);
  });

  it('never asks for more than the model allows', () => {
    expect(budgetFor(info({ outputLimit: 4096 }), 1024)).toBe(4096);
  });

  it('falls back for a model the catalogue does not know', () => {
    expect(budgetFor(undefined, 4096)).toBe(4096);
  });
});

describe('effortFor', () => {
  const reasoning = (efforts: string[]): ModelInfo => ({
    id: 'm',
    name: 'M',
    provider: 'openai',
    releaseDate: '',
    reasoning: true,
    efforts,
    outputLimit: null,
  });

  it('sends what the user picked when the model offers it', () => {
    expect(effortFor(reasoning(['minimal', 'low', 'medium', 'high']), 'low')).toBe('low');
  });

  it('snaps to the nearest value the model offers, weaker on a tie', () => {
    expect(effortFor(reasoning(['medium', 'high', 'xhigh']), 'low')).toBe('medium');
    expect(effortFor(reasoning(['low', 'high']), 'medium')).toBe('low');
  });

  it('sends nothing for default, for a model that does not reason, or one it does not know', () => {
    expect(effortFor(reasoning(['low']), 'default')).toBeUndefined();
    expect(effortFor({ ...reasoning(['low']), reasoning: false }, 'low')).toBeUndefined();
    expect(effortFor(undefined, 'low')).toBeUndefined();
  });
});
