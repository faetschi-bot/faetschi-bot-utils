import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { CACHE_SCHEMA_VERSION, listIndexDirs, readIndexMeta, resolveCacheRoot } from './core/cache.mjs';
import { redactText } from './core/redact.mjs';
import { PACKAGE_VERSION } from './package-info.mjs';
import { probeOpencode, readOpencodeEndpoint } from './sources/opencode.mjs';
import { defaultPiSessionsDir } from './sources/pi.mjs';

const MIN_NODE_MAJOR = 20;
const STALE_INDEX_DAYS = 30;
const REQUIRED_DEPENDENCIES = ['minisearch', '@modelcontextprotocol/server'];

export async function runDoctor({ env = process.env, platform = process.platform, home, cacheRoot, fetchImpl = fetch, readEndpoint = readOpencodeEndpoint } = {}) {
  const checks = [
    nodeCheck(),
    cacheCheck({ env, platform, home, cacheRoot }),
    await opencodeSourceCheck({ env, fetchImpl, readEndpoint }),
    sourceCheck('pi-source', () => {
      const dir = defaultPiSessionsDir({ env });
      return existsSync(dir) ? `sessions at ${dir}` : undefined;
    }),
    dependencyCheck(),
    redactionCheck(),
    scopeCheck(),
    indexCheck({ env, platform, home, cacheRoot }),
  ];
  return { ok: checks.every((check) => check.status !== 'fail'), version: PACKAGE_VERSION, checks };
}

function nodeCheck() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (major < MIN_NODE_MAJOR) {
    return { name: 'node', status: 'fail', message: `Node ${process.versions.node} is below the required ${MIN_NODE_MAJOR}` };
  }
  return { name: 'node', status: 'ok', message: `Node ${process.versions.node}` };
}

function cacheCheck({ env, platform, home, cacheRoot }) {
  const root = cacheRoot || resolveCacheRoot({ env, platform, home });
  const probe = join(root, '.doctor-probe');
  try {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeFileSync(probe, 'ok', { mode: 0o600 });
    rmSync(probe, { force: true });
  } catch (error) {
    return { name: 'cache', status: 'fail', message: `cannot write ${root}: ${error.message}` };
  }
  const mode = statSync(root).mode & 0o777;
  return { name: 'cache', status: 'ok', message: `${root} (mode ${mode.toString(8)})` };
}

// A registered OpenCode service that is not answering is a warning, not a
// failure: the service may simply be stopped.
async function opencodeSourceCheck({ env, fetchImpl, readEndpoint }) {
  const endpoint = readEndpoint({ env });
  if (!endpoint) return { name: 'opencode-source', status: 'skip', message: 'not detected on this machine' };
  const reachable = await probeOpencode(endpoint, { fetchImpl });
  if (reachable) return { name: 'opencode-source', status: 'ok', message: `reachable at ${endpoint.url}` };
  return { name: 'opencode-source', status: 'warn', message: `registered at ${endpoint.url} but not reachable; start OpenCode` };
}

function sourceCheck(name, probe) {
  const detail = probe();
  return detail ? { name, status: 'ok', message: detail } : { name, status: 'skip', message: 'not detected on this machine' };
}

function dependencyCheck() {
  const require = createRequire(import.meta.url);
  const missing = REQUIRED_DEPENDENCIES.filter((name) => {
    try {
      require.resolve(name);
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length === 0) return { name: 'dependencies', status: 'ok', message: `resolved ${REQUIRED_DEPENDENCIES.join(', ')}` };
  return { name: 'dependencies', status: 'warn', message: `missing ${missing.join(', ')}; run \`npm install\`` };
}

function redactionCheck() {
  const probe = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  if (redactText(probe).includes('ghp_')) return { name: 'redaction', status: 'fail', message: 'redaction self-test failed' };
  return { name: 'redaction', status: 'ok', message: 'secret patterns redact correctly' };
}

function scopeCheck() {
  return { name: 'scope', status: 'ok', message: 'default scope is the current project (use --all for every project)' };
}

function indexCheck({ env, platform, home, cacheRoot }) {
  const root = cacheRoot || resolveCacheRoot({ env, platform, home });
  const dirs = listIndexDirs(root);
  if (dirs.length === 0) return { name: 'index', status: 'warn', message: 'no index yet; run `session-search index`' };

  const metas = dirs.map((dir) => readIndexMeta(dir)).filter(Boolean);
  const unsupported = metas.filter((meta) => meta.schemaVersion !== CACHE_SCHEMA_VERSION);
  if (unsupported.length > 0) {
    return { name: 'index', status: 'fail', message: `${unsupported.length} index(es) use an unsupported schema; re-run \`session-search index\`` };
  }
  const newest = metas.map((meta) => meta.generatedAt).filter(Boolean).sort().pop();
  const ageDays = newest ? (Date.now() - Date.parse(newest)) / 86_400_000 : 0;
  if (ageDays > STALE_INDEX_DAYS) {
    return { name: 'index', status: 'warn', message: `newest index is ${Math.round(ageDays)} days old; re-run \`session-search index\`` };
  }
  return { name: 'index', status: 'ok', message: `${dirs.length} index(es); newest ${newest ?? 'unknown'}` };
}
