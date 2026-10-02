import { resolve } from 'node:path';
import { resolveCacheRoot } from './core/cache.mjs';
import { CliError } from './core/errors.mjs';
import { runDoctor } from './doctor.mjs';
import { indexOpencode, indexPi, persistIndex } from './index-run.mjs';
import { PACKAGE_NAME, PACKAGE_VERSION } from './package-info.mjs';
import { createOpencodeClient, readOpencodeEndpoint } from './sources/opencode.mjs';
import { defaultPiSessionsDir } from './sources/pi.mjs';

const HARNESSES = ['opencode', 'pi', 'all'];

export function usage() {
  return `${PACKAGE_NAME} - search local AI coding-agent session history.

Usage:
  session-search index [options]     read session history into the local cache
  session-search doctor [options]    check Node, cache, and detected sources

Options:
  --harness <name>    opencode | pi | all (default: all)
  --project <dir>     scope to sessions under this directory (default: cwd)
  --all               index every project instead of the current one
  --pi-sessions <dir> Pi sessions directory (default: ~/.pi/agent/sessions)
  --cache <dir>       cache root (default: platform cache dir)
  --no-redact         do not redact secrets before writing the index
  --force             rebuild even when the source fingerprint is unchanged
  --json              print a machine-readable result
  --help, -h          show this help
  --version           show the version

The index is a rebuildable cache of normalized Turns; tool outputs are never
indexed. Run \`session-search index\` before searching (search lands in a later
increment of this tool).`;
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
  else console.log(usage());
}

function parse(argv) {
  const opts = { command: undefined, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if ((token === 'index' || token === 'doctor') && opts.command === undefined) {
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
    else if (token === '--json') opts.json = true;
    else if (token === '--all') opts.all = true;
    else if (token === '--no-redact') opts.redact = false;
    else if (token === '--force') opts.force = true;
    else if (token === '--help' || token === '-h') opts.help = true;
    else if (token === '--version') opts.version = true;
    else if (token.startsWith('--')) throw new CliError(`Unknown option: ${token}`);
    else throw new CliError(`Unexpected argument: ${token}`);
  }
  if (opts.harness && !HARNESSES.includes(opts.harness)) {
    throw new CliError(`--harness must be one of ${HARNESSES.join(', ')}`);
  }
  return opts;
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
  const cacheRoot = opts.cache ? resolve(opts.cache) : resolveCacheRoot();
  const scope = opts.all ? 'all' : 'project';
  const project = scope === 'all' ? '' : resolve(opts.project || process.cwd());
  const redact = opts.redact !== false;
  const names = opts.harness && opts.harness !== 'all' ? [opts.harness] : ['opencode', 'pi'];
  const results = [];

  for (const harness of names) {
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

// bin/session-search.mjs calls main and maps errors to an exit code.
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
