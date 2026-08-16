import { describe, it } from 'vitest';
import { type ExtractedJob, extractedJobSchema, makeProvider } from '../src/index';
import { EXTRACT_JOB_SYSTEM_PROMPT } from '../src/prompts/extract-job';
import { envVar } from './env';
import { fixtures } from './fixtures';

// Live model calls against realistic, noisy fixtures. Opt-in only: each provider
// block is skipped unless its API key (or, for Ollama, an explicit run flag) is
// set, so a normal `pnpm test` never makes a network call or costs money.
//
// Run for real, e.g.:
//   ANTHROPIC_API_KEY=sk-... pnpm --filter @jlog/llm test extraction.eval
//   OPENAI_API_KEY=sk-...    pnpm --filter @jlog/llm test extraction.eval
//   GEMINI_API_KEY=...       pnpm --filter @jlog/llm test extraction.eval
//   LLM_EVAL_RUN_OLLAMA=1    pnpm --filter @jlog/llm test extraction.eval   (needs local Ollama running)
//
// A failure prints exactly which fixture, which field, and what came back —
// see fixtures.ts for what real-world page clutter each one reproduces.

function assertField(field: string, actual: string | null, expected: string | null): void {
  if (expected === null) {
    if (actual !== null) throw new Error(`${field}: expected null, got "${actual}"`);
    return;
  }
  if (actual === null) throw new Error(`${field}: expected "${expected}", got null`);

  const a = actual.trim().toLowerCase();
  const e = expected.trim().toLowerCase();
  // Exact match, or either containing the other — extraction wording can vary
  // slightly ("Registered Nurse" vs "Registered Nurse, ICU") without being wrong.
  const matches = a === e || a.includes(e) || e.includes(a);
  if (!matches) throw new Error(`${field}: expected to match "${expected}", got "${actual}"`);
}

interface ProviderCase {
  label: string;
  configured: boolean;
  build: () => Parameters<typeof makeProvider>[0];
}

const providerCases: ProviderCase[] = [
  {
    label: 'anthropic',
    configured: Boolean(envVar('ANTHROPIC_API_KEY')),
    build: () => ({
      provider: 'anthropic',
      apiKey: envVar('ANTHROPIC_API_KEY') ?? '',
      model: envVar('LLM_EVAL_ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-20241022',
    }),
  },
  {
    label: 'openai',
    configured: Boolean(envVar('OPENAI_API_KEY')),
    build: () => ({
      provider: 'openai',
      apiKey: envVar('OPENAI_API_KEY') ?? '',
      model: envVar('LLM_EVAL_OPENAI_MODEL') ?? 'gpt-4o-mini',
    }),
  },
  {
    label: 'gemini',
    configured: Boolean(envVar('GEMINI_API_KEY')),
    build: () => ({
      provider: 'gemini',
      apiKey: envVar('GEMINI_API_KEY') ?? '',
      model: envVar('LLM_EVAL_GEMINI_MODEL') ?? 'gemini-1.5-flash',
    }),
  },
  {
    label: 'ollama',
    configured: envVar('LLM_EVAL_RUN_OLLAMA') === '1',
    build: () => ({
      provider: 'ollama',
      model: envVar('LLM_EVAL_OLLAMA_MODEL') ?? 'llama3.1',
      ollamaUrl: envVar('OLLAMA_URL') ?? 'http://localhost:11434',
    }),
  },
];

for (const providerCase of providerCases) {
  describe.skipIf(!providerCase.configured)(`extraction accuracy: ${providerCase.label}`, () => {
    const provider = makeProvider(providerCase.build());

    for (const fixture of fixtures) {
      it(`${fixture.name}: ${fixture.note}`, async () => {
        const result = (await provider.extractJSON(
          'Extract the job details from the following job posting content:',
          extractedJobSchema,
          fixture.text,
        )) as ExtractedJob;

        assertField('company', result.company, fixture.expected.company);
        assertField('role', result.role, fixture.expected.role);
        assertField('location', result.location, fixture.expected.location);
      });
    }
  });
}
