import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { resolveCacheRoot } from './core/cache.mjs';
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

// MiniSearch is a runtime dependency; a vendored checkout without `npm install`
// can still run doctor, but search will not work.
function dependencyCheck() {
  try {
    createRequire(import.meta.url).resolve('minisearch');
    return { name: 'dependencies', status: 'ok', message: 'minisearch resolved' };
  } catch {
    return { name: 'dependencies', status: 'warn', message: 'minisearch not installed; run `npm install`' };
  }
}
