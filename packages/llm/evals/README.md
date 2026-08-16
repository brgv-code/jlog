# Extraction evals

`/api/extract` sends up to 6000 characters of raw `document.body.innerText` (nav,
cookie banners, "related jobs" widgets, and all) to whichever LLM the user has
configured, and expects back `{ company, role, location, confidence }`. Wrong
values landing in the dashboard can come from two different layers, and this
folder tests them separately:

- **`schema-normalization.test.ts`** — the code layer. Does `extractedJobSchema`
  actually normalize null/empty/miscoerced provider output the way its comments
  claim (empty company → `''`, empty location → `null`, a stringified
  confidence → coerced, an out-of-range confidence → `0.5`)? No API calls, no
  cost, runs on every `pnpm test`.

- **`extraction.eval.test.ts`** — the model-judgment layer. Given a realistic,
  noisy page dump, does the model actually pick the right company/role/location
  out of the clutter? This needs a real model call, so it's opt-in per
  provider — skipped by default, runs when you set the matching key:

  ```bash
  ANTHROPIC_API_KEY=sk-... pnpm --filter @jlog/llm test extraction.eval
  OPENAI_API_KEY=sk-...    pnpm --filter @jlog/llm test extraction.eval
  GEMINI_API_KEY=...       pnpm --filter @jlog/llm test extraction.eval
  LLM_EVAL_RUN_OLLAMA=1    pnpm --filter @jlog/llm test extraction.eval   # needs `ollama serve` running
  ```

  Override the model per provider with `LLM_EVAL_ANTHROPIC_MODEL`,
  `LLM_EVAL_OPENAI_MODEL`, `LLM_EVAL_GEMINI_MODEL`, `LLM_EVAL_OLLAMA_MODEL`
  (defaults are cheap/fast models, not necessarily what you have configured in
  jlog itself). `OLLAMA_URL` overrides the Ollama host, default
  `http://localhost:11434`.

A failing eval prints the fixture name, its `note` (what real-world clutter it
reproduces), which field was wrong, and what came back vs. what was expected —
that's the "view and verify" this folder exists for, instead of only noticing a
bad value after it's already sitting in someone's dashboard.

## Adding a fixture

When you actually hit a bad extraction in the wild, that's the fixture to add,
not a synthetic one. Turn the page dump into a new entry in `fixtures.ts`:
`name`, the raw `text` (trim anything identifying if it's a real page), the
`expected` fields, and a `note` explaining what specifically confused the
model. It runs against every configured provider automatically.

`location: null` in `expected` means "should come back null" (remote or
ambiguous per the system prompt's own rule) — not "no assertion."

## Why `company`/`role` matching is fuzzy, not exact

`assertField` accepts an exact match or either string containing the other
("Registered Nurse" matching "Registered Nurse, ICU"). Extraction wording
varies slightly between providers and that's fine; the fixtures exist to catch
the model grabbing the *wrong* company or role entirely, not to enforce exact
phrasing.
