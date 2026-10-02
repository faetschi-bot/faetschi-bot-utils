import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { resolveCacheRoot, listIndexDirs, readIndexMeta } from './core/cache.mjs';
import { redactText } from './core/redact.mjs';
import { PACKAGE_VERSION } from './package-info.mjs';
import { readOpencodeEndpoint } from './sources/opencode.mjs';
import { defaultPiSessionsDir } from './sources/pi.mjs';

const MIN_NODE_MAJOR = 20;

export function runDoctor({ env = process.env, platform = process.platform, home } = {}) {
  const checks = [
    nodeCheck(),
    cacheCheck({ env, platform, home }),
    sourceCheck('opencode-source', () => {
      const endpoint = readOpencodeEndpoint({ env });
      return endpoint ? `service registered at ${endpoint.url}` : undefined;
    }),
    sourceCheck('pi-source', () => {
      const dir = defaultPiSessionsDir({ env });
      return existsSync(dir) ? `sessions at ${dir}` : undefined;
    }),
    dependencyCheck(),
    redactionCheck(),
    indexCheck({ env, platform, home }),
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

function cacheCheck({ env, platform, home }) {
  const root = resolveCacheRoot({ env, platform, home });
  const probe = join(root, '.doctor-probe');
  try {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeFileSync(probe, 'ok', { mode: 0o600 });
    rmSync(probe, { force: true });
  } catch (error) {
    return { name: 'cache', status: 'fail', message: `cannot write ${root}: ${error.message}` };
  }
  return { name: 'cache', status: 'ok', message: root };
}

// Missing harnesses are a skip, not a failure: a machine may only use one.
function sourceCheck(name, probe) {
  const detail = probe();
  return detail
    ? { name, status: 'ok', message: detail }
    : { name, status: 'skip', message: 'not detected on this machine' };
}

// Runtime dependencies; a vendored checkout without `npm install` can still run
// doctor, but search and the MCP server will not work.
const REQUIRED_DEPENDENCIES = ['minisearch', '@modelcontextprotocol/server'];

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
  if (missing.length === 0) {
    return { name: 'dependencies', status: 'ok', message: `resolved ${REQUIRED_DEPENDENCIES.join(', ')}` };
  }
  return { name: 'dependencies', status: 'warn', message: `missing ${missing.join(', ')}; run \`npm install\`` };
}

// A fast self-test so a broken redaction rule set fails doctor, not a leak.
function redactionCheck() {
  const probe = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  if (redactText(probe).includes('ghp_')) {
    return { name: 'redaction', status: 'fail', message: 'redaction self-test failed' };
  }
  return { name: 'redaction', status: 'ok', message: 'secret patterns redact correctly' };
}

function indexCheck({ env, platform, home }) {
  const root = resolveCacheRoot({ env, platform, home });
  const dirs = listIndexDirs(root);
  if (dirs.length === 0) return { name: 'index', status: 'warn', message: 'no index yet; run `session-search index`' };
  const newest = dirs
    .map((dir) => readIndexMeta(dir)?.generatedAt)
    .filter(Boolean)
    .sort()
    .pop();
  return { name: 'index', status: 'ok', message: `${dirs.length} index(es); newest ${newest ?? 'unknown'}` };
}
