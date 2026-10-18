import type { ModelInfo } from '@jlog/shared';
import { describe, expect, it } from 'vitest';
import { defaultModel, modelLabel } from './llmModels';

const model = (over: Partial<ModelInfo>): ModelInfo => ({
  id: 'gpt-5-nano',
  name: 'GPT-5 Nano',
  provider: 'openai',
  releaseDate: '2025-08-07',
  reasoning: true,
  efforts: ['minimal', 'low', 'medium', 'high'],
  outputLimit: 128000,
  ...over,
});

describe('modelLabel', () => {
  it('names the model, its release month, and that it reasons', () => {
    expect(modelLabel(model({}), null)).toBe('GPT-5 Nano · Aug 2025 · reasoning');
  });

  // Hidden would read as "jlog does not support it"; marked tells the truth.
  it('marks a model this key cannot call instead of hiding it', () => {
    expect(modelLabel(model({ reasoning: false }), ['gpt-4o-mini'])).toBe(
      'GPT-5 Nano · Aug 2025 · not on your key',
    );
  });
});

describe('defaultModel', () => {
  const models = [model({ id: 'a' }), model({ id: 'b' }), model({ id: 'c' })];

  it('picks the newest model the key can call', () => {
    expect(defaultModel({ models, latest: ['a', 'b'], available: ['b', 'c'] })).toBe('b');
  });

  it('picks the newest model when access is unknown', () => {
    expect(defaultModel({ models, latest: ['a', 'b'], available: null })).toBe('a');
  });

  it('leaves the field empty when there is nothing to offer', () => {
    expect(defaultModel({ models: [], latest: [], available: null })).toBe('');
  });
});
