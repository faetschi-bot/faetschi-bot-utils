import { resolve } from 'node:path';
import { indexDir, readIndexDocs, readIndexMeta, resolveCacheRoot } from './core/cache.mjs';
import { CliError } from './core/errors.mjs';
import { buildIndex, searchSessions } from './core/retrieval.mjs';
import { runDoctor } from './doctor.mjs';
import { indexOpencode, indexPi, persistIndex } from './index-run.mjs';
import { PACKAGE_NAME, PACKAGE_VERSION } from './package-info.mjs';
import { createOpencodeClient, readOpencodeEndpoint } from './sources/opencode.mjs';
import { defaultPiSessionsDir } from './sources/pi.mjs';

const HARNESSES = ['opencode', 'pi', 'all'];
const ALL_HARNESSES = ['opencode', 'pi'];

export function usage() {
  return `${PACKAGE_NAME} - search local AI coding-agent session history.

Usage:
  session-search index [options]              read session history into the cache
  session-search search "<query>" [options]   search the cached history
  session-search show <sessionID> [options]   print one session's indexed turns
  session-search doctor [options]             check Node, cache, and sources
  session-search mcp                          run the MCP stdio server
Options:
  --harness <name>    opencode | pi | all (default: all)
  --project <dir>     scope to sessions under this directory (default: cwd)
  --all               use every project instead of the current one
  --limit <n>         max results (search, default 10) or turns (show)
  --include-subagents keep child sessions instead of folding them into parents
  --pi-sessions <dir> Pi sessions directory (default: ~/.pi/agent/sessions)
  --cache <dir>       cache root (default: platform cache dir)
  --no-redact         do not redact secrets before writing the index
  --force             rebuild even when the source fingerprint is unchanged
  --json              print a machine-readable result
  --help, -h          show this help
  --version           show the version

The index is a rebuildable cache of normalized Turns; tool outputs are never
indexed. Run \`session-search index\` before searching.`;
}

export async function main(argv) {
  const opts = parse(argv);
  if (opts.help) {
    console.log(usage());
    return;
  }
  if (opts.version) {
    console.log(PACKAGE_VERSION);
    return;
  }
  if (opts.command === 'doctor') runDoctorCommand(opts);
  else if (opts.command === 'index') await runIndexCommand(opts);
  else if (opts.command === 'search') runSearchCommand(opts);
  else if (opts.command === 'show') runShowCommand(opts);
  else if (opts.command === 'mcp') await runMcpCommand(opts);
  else console.log(usage());
}

function parse(argv) {
  const opts = { command: undefined, json: false, positionals: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (['index', 'search', 'show', 'doctor', 'mcp'].includes(token) && opts.command === undefined) {
      opts.command = token;
      continue;
    }
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new CliError(`Missing value for ${token}`);
      return next;
    };
    if (token === '--harness') opts.harness = value();
    else if (token === '--project') opts.project = value();
    else if (token === '--pi-sessions') opts.piSessions = value();
    else if (token === '--cache') opts.cache = value();
    else if (token === '--limit') opts.limit = Number.parseInt(value(), 10);
    else if (token === '--json') opts.json = true;
    else if (token === '--all') opts.all = true;
    else if (token === '--include-subagents') opts.includeSubagents = true;
    else if (token === '--no-redact') opts.redact = false;
    else if (token === '--force') opts.force = true;
    else if (token === '--help' || token === '-h') opts.help = true;
    else if (token === '--version') opts.version = true;
    else if (token.startsWith('--')) throw new CliError(`Unknown option: ${token}`);
    else opts.positionals.push(token);
  }
  if (opts.harness && !HARNESSES.includes(opts.harness)) {
    throw new CliError(`--harness must be one of ${HARNESSES.join(', ')}`);
  }
  if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
    throw new CliError('--limit must be a positive integer');
  }
  return opts;
}

function scopeOf(opts) {
  const scope = opts.all ? 'all' : 'project';
  const project = scope === 'all' ? '' : resolve(opts.project || process.cwd());
  return { scope, project };
}

function harnessesOf(opts) {
  return opts.harness && opts.harness !== 'all' ? [opts.harness] : ALL_HARNESSES;
}

function runDoctorCommand(opts) {
  const result = runDoctor();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const check of result.checks) console.log(`[${check.status}] ${check.name}: ${check.message}`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

async function runIndexCommand(opts) {
  if (opts.positionals.length) throw new CliError(`index takes no arguments: ${opts.positionals.join(' ')}`);
  const cacheRoot = opts.cache ? resolve(opts.cache) : resolveCacheRoot();
  const { scope, project } = scopeOf(opts);
  const redact = opts.redact !== false;
  const results = [];

  for (const harness of harnessesOf(opts)) {
    if (harness === 'opencode') {
      const endpoint = readOpencodeEndpoint();
      if (!endpoint) {
        results.push({ harness, status: 'skip', reason: 'no OpenCode service registration found' });
        continue;
      }
      const client = createOpencodeClient(endpoint);
      results.push(await runOne(harness, () => indexOpencode({ client, cacheRoot, scope, project, redact }), opts));
    } else if (harness === 'pi') {
      const sessionsRoot = opts.piSessions || defaultPiSessionsDir();
      results.push(await runOne(harness, () => indexPi({ sessionsRoot, cacheRoot, scope, project, redact }), opts));
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, cacheRoot, scope, project, results }, null, 2));
    return;
  }
  for (const result of results) {
    if (result.status === 'skip') console.log(`[${result.harness}] skipped: ${result.reason}`);
    else console.log(`[${result.harness}] ${result.skipped ? 'fresh' : 'indexed'} ${result.turns} turns from ${result.sessions} sessions -> ${result.dir}`);
  }
}

async function runOne(harness, build, opts) {
  const built = await build();
  const { dir, meta, skipped } = persistIndex(built, { force: opts.force });
  return { harness, status: 'ok', skipped, turns: meta.turns, sessions: meta.sessions, dir };
}

async function runMcpCommand(opts) {
  if (opts.positionals.length) throw new CliError(`mcp takes no arguments: ${opts.positionals.join(' ')}`);
  const cacheRoot = opts.cache ? resolve(opts.cache) : resolveCacheRoot();
  // Lazy so index/search/doctor run on a checkout without the MCP dependency.
  const { serve } = await import('./mcp-server.mjs');
  serve({ cacheRoot, cwd: process.cwd() });
}

function loadTurns(opts) {
  const cacheRoot = opts.cache ? resolve(opts.cache) : resolveCacheRoot();
  const { scope, project } = scopeOf(opts);
  const turns = [];
  const sources = [];
  for (const harness of harnessesOf(opts)) {
    const dir = indexDir(cacheRoot, harness, `${scope}:${project}`);
    const meta = readIndexMeta(dir);
    if (!meta) continue;
    turns.push(...readIndexDocs(dir));
    sources.push({ harness, dir, generatedAt: meta.generatedAt });
  }
  if (sources.length === 0) {
    throw new CliError(`no index for ${scope}:${project || '(all)'}; run \`session-search index\` first`, 1);
  }
  return { turns, sources, cacheRoot, scope, project };
}

function runSearchCommand(opts) {
  const query = opts.positionals.join(' ').trim();
  if (!query) throw new CliError('search requires a query');
  const { turns, sources, scope, project } = loadTurns(opts);
  const index = buildIndex(turns);
  const results = searchSessions(index, query, {
    limit: opts.limit ?? 10,
    includeSubagents: opts.includeSubagents,
  });

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, query, scope, project, sources: sources.map((source) => source.harness), results }, null, 2));
    return;
  }
  if (results.length === 0) {
    console.log(`[${PACKAGE_NAME}] no matches for "${query}"`);
    return;
  }
  for (const result of results) {
    const child = result.parent ? ` (child of ${result.parent})` : '';
    console.log(`${result.score.toFixed(2)}  ${result.title || result.session}  [${result.harness}]${child}`);
    console.log(`    ${result.snippet}`);
    console.log(`    session ${result.session}  ${result.match.role}/${result.match.kind}`);
  }
}

function runShowCommand(opts) {
  const sessionId = opts.positionals[0];
  if (!sessionId) throw new CliError('show requires a session id');
  const { turns, sources } = loadTurns(opts);
  const sessionTurns = turns.filter((turn) => turn.session === sessionId).sort((a, b) => a.seq - b.seq);
  if (sessionTurns.length === 0) throw new CliError(`session not found in the index: ${sessionId}`);
  const limit = opts.limit ?? sessionTurns.length;
  const shown = sessionTurns.slice(0, limit);

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, session: sessionId, sources: sources.map((source) => source.harness), turns: shown }, null, 2));
    return;
  }
  console.log(`${sessionTurns[0].title || sessionId}  [${sessionTurns[0].harness}]`);
  for (const turn of shown) console.log(`  ${turn.role}/${turn.kind}: ${turn.text.replace(/\s+/g, ' ').slice(0, 300)}`);
  if (sessionTurns.length > shown.length) console.log(`  … ${sessionTurns.length - shown.length} more turns`);
}

export async function cli(argv, io = { out: console, error: console }) {
  try {
    await main(argv);
  } catch (error) {
    const code = error instanceof CliError ? error.code : 1;
    if (argv.includes('--json')) io.out.log(JSON.stringify({ ok: false, error: error.message }));
    else io.error.error(`[${PACKAGE_NAME}] ${error.message}`);
    process.exitCode = code;
  }
}
