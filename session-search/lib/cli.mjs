import { resolve } from 'node:path';
import { indexDir, readIndexDocs, readIndexMeta, resolveCacheRoot } from './core/cache.mjs';
import { CliError } from './core/errors.mjs';
import { runDoctor } from './doctor.mjs';
import { indexOpencode, indexPi, loadPrevious, persistIndex } from './index-run.mjs';
import { installAdapter, mcpConfigSnippet } from './install.mjs';
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
  session-search install [options]            install the OpenCode/Pi adapter
Options:
  --harness <name>    opencode | pi | all (default: all)
  --project <dir>     scope to sessions under this directory (default: cwd)
  --all               use every project instead of the current one
  --limit <n>         max results (search, default 10) or turns (show)
  --recency <0..1>    weak recency boost for search (0 = off, default 0)
  --include-subagents keep child sessions instead of folding them into parents
  --pi-sessions <dir> Pi sessions directory (default: ~/.pi/agent/sessions)
  --cache <dir>       cache root (default: platform cache dir)
  --no-redact         do not redact secrets before writing the index
  --force             rebuild even when the source fingerprint is unchanged
  --progress          print indexing progress to stderr
  --global            install the adapter to the user-global location
  --dry-run           report what install would write
  --print             print an MCP config snippet instead of writing
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
  if (opts.command === 'doctor') await runDoctorCommand(opts);
  else if (opts.command === 'index') await runIndexCommand(opts);
  else if (opts.command === 'search') await runSearchCommand(opts);
  else if (opts.command === 'show') runShowCommand(opts);
  else if (opts.command === 'mcp') await runMcpCommand(opts);
  else if (opts.command === 'install') runInstallCommand(opts);
  else if (opts.positionals.length) throw new CliError(`Unknown command: ${opts.positionals[0]}`);
  else console.log(usage());
}

function parse(argv) {
  const opts = { command: undefined, json: false, positionals: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (['index', 'search', 'show', 'doctor', 'mcp', 'install'].includes(token) && opts.command === undefined) {
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
    else if (token === '--recency') opts.recency = Number(value());
    else if (token === '--json') opts.json = true;
    else if (token === '--all') opts.all = true;
    else if (token === '--global') opts.global = true;
    else if (token === '--dry-run') opts.dryRun = true;
    else if (token === '--progress') opts.progress = true;
    else if (token === '--print') opts.print = true;
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
  if (opts.recency !== undefined && (!Number.isFinite(opts.recency) || opts.recency < 0 || opts.recency > 1)) {
    throw new CliError('--recency must be a number between 0 and 1');
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

async function runDoctorCommand(opts) {
  const result = await runDoctor({ cacheRoot: opts.cache ? resolve(opts.cache) : undefined });
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
  const onProgress = opts.progress && !opts.json ? (progress) => process.stderr.write(`[${progress.harness}] ${progress.done}/${progress.total}\n`) : undefined;
  const results = [];

  for (const harness of harnessesOf(opts)) {
    const dir = indexDir(cacheRoot, harness, `${scope}:${project}`);
    const previous = loadPrevious(dir, redact);
    if (harness === 'opencode') {
      const endpoint = readOpencodeEndpoint();
      if (!endpoint) {
        results.push({ harness, status: 'skip', reason: 'no OpenCode service registration found' });
        continue;
      }
      const client = createOpencodeClient(endpoint);
      results.push(await runOne(harness, () => indexOpencode({ client, cacheRoot, scope, project, redact, previous, onProgress }), opts));
    } else if (harness === 'pi') {
      const sessionsRoot = opts.piSessions || defaultPiSessionsDir();
      results.push(await runOne(harness, () => indexPi({ sessionsRoot, cacheRoot, scope, project, redact, previous, onProgress }), opts));
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
  let serve;
  try {
    ({ serve } = await import('./mcp-server.mjs'));
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') throw new CliError('mcp requires @modelcontextprotocol/server; run `npm install`', 1);
    throw error;
  }
  serve({ cacheRoot, cwd: process.cwd() });
}

function runInstallCommand(opts) {
  if (opts.positionals.length) throw new CliError(`install takes no arguments: ${opts.positionals.join(' ')}`);
  const cacheRoot = opts.cache ? resolve(opts.cache) : '';
  const harnesses = opts.harness === 'all' ? ['opencode', 'pi'] : [opts.harness || 'opencode'];

  if (opts.print) {
    const snippets = Object.fromEntries(harnesses.map((harness) => [harness, mcpConfigSnippet(harness, { cacheRoot })]));
    if (opts.json) console.log(JSON.stringify({ ok: true, snippets }, null, 2));
    else for (const harness of harnesses) console.log(`# ${harness}\n${JSON.stringify(snippets[harness], null, 2)}`);
    return;
  }

  const installed = harnesses.map((harness) =>
    installAdapter(harness, { global: opts.global, cacheRoot, force: opts.force, dryRun: opts.dryRun }),
  );
  if (opts.json) console.log(JSON.stringify({ ok: true, global: !!opts.global, dryRun: !!opts.dryRun, installed }, null, 2));
  else for (const item of installed) console.log(`[${item.harness}] ${item.dryRun ? 'would install' : 'installed'} -> ${item.path}`);
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
  // Lazy so doctor/index run on a checkout without the retrieval dependency.
  return import('./core/retrieval.mjs')
    .then(({ buildIndex, searchSessions }) => {
      const results = searchSessions(buildIndex(turns), query, {
        limit: opts.limit ?? 10,
        includeSubagents: opts.includeSubagents,
        recency: opts.recency ?? 0,
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
    })
    .catch((error) => {
      if (error.code === 'ERR_MODULE_NOT_FOUND') throw new CliError('search requires the minisearch dependency; run `npm install`', 1);
      throw error;
    });
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
