// Regenerate src/models/snapshot.json from models.dev.
//
//   node packages/shared/scripts/refresh-models.mjs [path/to/api.json]
//
// The snapshot is the fallback the API serves when the live catalogue cannot be
// fetched, and what a self-hosted instance without outbound access shows. Only
// the three providers jlog calls are kept, and only the fields `readCatalogue`
// reads, so the file stays small enough to review in a diff.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://models.dev/api.json';
const PROVIDERS = ['anthropic', 'openai', 'google'];
const FIELDS = [
  'id',
  'name',
  'release_date',
  'reasoning',
  'reasoning_options',
  'structured_output',
  'tool_call',
  'limit',
  'modalities',
];

const from = process.argv[2];
const doc = from ? JSON.parse(await readFile(from, 'utf8')) : await (await fetch(SOURCE)).json();

const out = {};
for (const provider of PROVIDERS) {
  const models = {};
  for (const [id, model] of Object.entries(doc[provider]?.models ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const kept = {};
    for (const field of FIELDS) {
      if (model[field] === undefined) continue;
      kept[field] =
        field === 'limit'
          ? { output: model.limit?.output }
          : field === 'modalities'
            ? { output: model.modalities?.output }
            : model[field];
    }
    models[id] = kept;
  }
  out[provider] = { models };
}

const target = join(dirname(fileURLToPath(import.meta.url)), '../src/models/snapshot.json');
await writeFile(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(
  `wrote ${target}: ${PROVIDERS.map((p) => `${p} ${Object.keys(out[p].models).length}`).join(', ')}`,
);
