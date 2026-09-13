Weekly /api/extract trace review log. See evals/README.md for the fixture format.

## Week of 2026-09-06

- [ ] Open the jlog Langfuse project, review the past week's `/api/extract` traces
- [ ] Flag: any trace with an ERROR-level generation, any output that clearly does not match the input, any low-confidence result
- [ ] For each flagged trace, hand-check the correct answer against the real page, then add a fixture to `packages/llm/evals/fixtures.ts` and run `pnpm --filter @jlog/llm test extraction.eval`
- [ ] If the bug is below the model (DOM/site layer), also add a regression test in `apps/extension/src/lib/domExtractors.test.ts`
- [ ] Fill in: traces reviewed, what got caught, fixture names added

## Week of 2026-09-13

- [ ] Open the jlog Langfuse project, review the past week's `/api/extract` traces
- [ ] Flag: any trace with an ERROR-level generation, any output that clearly does not match the input, any low-confidence result
- [ ] For each flagged trace, hand-check the correct answer against the real page, then add a fixture to `packages/llm/evals/fixtures.ts` and run `pnpm --filter @jlog/llm test extraction.eval`
- [ ] If the bug is below the model (DOM/site layer), also add a regression test in `apps/extension/src/lib/domExtractors.test.ts`
- [ ] Fill in: traces reviewed, what got caught, fixture names added
