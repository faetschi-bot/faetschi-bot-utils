// Offline labeling helper (not part of the CI gate, no network/LLM here).
// Prints the candidate session pool for each query so a human or an agent can
// assign grades, then paste them into eval/queries.jsonl.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, searchSessions } from '../lib/core/retrieval.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const turns = readJsonl(join(here, 'corpus', 'turns.jsonl'));
const queries = readJsonl(join(here, 'queries.jsonl'));
const index = buildIndex(turns);

for (const query of queries) {
  console.log(`\n# ${query.id} [${query.category}] ${query.query}`);
  for (const hit of searchSessions(index, query.query, { limit: 10, includeSubagents: true })) {
    console.log(`  ${hit.session}\t${hit.score}\t${hit.title || '(untitled)'}`);
  }
}

function readJsonl(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}
