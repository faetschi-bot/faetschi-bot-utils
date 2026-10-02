// Retrieval-quality gate. Runs a frozen, committed corpus and query set through
// the real search path and fails when session-level NDCG@10 drops more than
// MAX_DROP below eval/baseline.json. Deterministic and offline: no network and
// no LLM at gate time. Use eval/judge.mjs offline to build or extend labels.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, searchSessions } from '../lib/core/retrieval.mjs';
import { mrrAtK, ndcgAtK, recallAtK } from './metrics.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(here, 'corpus', 'turns.jsonl');
const QUERIES = join(here, 'queries.jsonl');
const BASELINE = join(here, 'baseline.json');
const K = 10;
const MAX_DROP = 0.02;

function readJsonl(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export function evaluate() {
  const turns = readJsonl(CORPUS);
  const queries = readJsonl(QUERIES);
  const index = buildIndex(turns);
  const rows = queries.map((query) => {
    const ranked = searchSessions(index, query.query, { limit: K, includeSubagents: true }).map((hit) => hit.session);
    const grades = Object.fromEntries((query.expected ?? []).map((entry) => [entry.session, entry.grade]));
    return {
      id: query.id,
      category: query.category,
      ndcg: round(ndcgAtK(ranked, grades, K)),
      recall: round(recallAtK(ranked, grades, K)),
      mrr: round(mrrAtK(ranked, grades, K)),
    };
  });
  const categories = [...new Set(rows.map((row) => row.category))];
  const byCategory = {};
  for (const category of categories) {
    const subset = rows.filter((row) => row.category === category);
    byCategory[category] = {
      queries: subset.length,
      ndcg: average(subset, 'ndcg'),
      recall: average(subset, 'recall'),
      mrr: average(subset, 'mrr'),
    };
  }
  return { k: K, overall: { queries: rows.length, ndcg: average(rows, 'ndcg'), recall: average(rows, 'recall'), mrr: average(rows, 'mrr') }, byCategory, rows };
}

function average(rows, key) {
  return round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
}

function round(value) {
  return Number(value.toFixed(4));
}

function compare(result, baseline) {
  const failures = [];
  const check = (label, before, after) => {
    if (before - after > MAX_DROP) failures.push(`${label}: NDCG@${K} ${after} < baseline ${before} (drop > ${MAX_DROP})`);
  };
  check('overall', baseline.overall.ndcg, result.overall.ndcg);
  for (const [category, before] of Object.entries(baseline.byCategory)) {
    const after = result.byCategory[category];
    if (!after) failures.push(`category ${category}: missing from the current run`);
    else check(category, before.ndcg, after.ndcg);
  }
  return failures;
}

function format(result) {
  const lines = [`NDCG@${K}  overall ${result.overall.ndcg}  (recall@${K} ${result.overall.recall}, mrr ${result.overall.mrr})`];
  for (const [category, metrics] of Object.entries(result.byCategory)) {
    lines.push(`  ${category.padEnd(10)} ndcg ${metrics.ndcg}  recall ${metrics.recall}  mrr ${metrics.mrr}  (${metrics.queries} queries)`);
  }
  return lines.join('\n');
}

function main(argv) {
  const result = evaluate();
  if (argv.includes('--update')) {
    writeFileSync(BASELINE, `${JSON.stringify({ overall: result.overall, byCategory: result.byCategory }, null, 2)}\n`);
    console.log(`[eval] wrote baseline\n${format(result)}`);
    return;
  }
  if (!existsSync(BASELINE)) {
    console.error('[eval] missing eval/baseline.json; run `npm run eval:update`');
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const failures = compare(result, baseline);
  if (argv.includes('--json')) console.log(JSON.stringify({ ok: failures.length === 0, result, baseline, failures }, null, 2));
  else {
    console.log(format(result));
    if (failures.length) console.error(`[eval] FAIL\n  ${failures.join('\n  ')}`);
    else console.log('[eval] ok');
  }
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2));
