import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CliError } from './errors.mjs';

// Bump when the on-disk cache layout changes so stale caches are ignored.
export const CACHE_SCHEMA_VERSION = 1;
const LOCK_STALE_MS = 10 * 60 * 1000;
const DOCS_FILE = 'docs.ndjson';
const META_FILE = 'meta.json';
const LOCK_FILE = '.lock';

const INDEX_MODE = 0o700;
const FILE_MODE = 0o600;

export function resolveCacheRoot({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  if (env.SESSION_SEARCH_CACHE) return resolve(env.SESSION_SEARCH_CACHE);
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'session-search');
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'session-search');
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'session-search');
}

export function scopeKey(scope) {
  return createHash('sha1').update(scope || 'all').digest('hex').slice(0, 12);
}

// The fingerprint summarizes the source state so a rebuild happens only when a
// session or file actually changed. Callers pass cheap per-source markers.
export function fingerprintFromParts(parts) {
  return createHash('sha256').update([...parts].sort().join('\n')).digest('hex').slice(0, 16);
}

export function indexDir(root, harness, scope) {
  return join(root, harness, scopeKey(scope));
}

function ensureDir(dir, mode = INDEX_MODE) {
  mkdirSync(dir, { recursive: true, mode });
  try {
    chmodSync(dir, mode);
  } catch {
    // Permission bits are best effort on platforms that lack POSIX modes.
  }
}

function writeFileAtomic(file, contents) {
  const tmp = `${file}.tmp.${process.pid}`;
  writeFileSync(tmp, contents, { mode: FILE_MODE });
  try {
    chmodSync(tmp, FILE_MODE);
  } catch {
    // Best effort.
  }
  renameSync(tmp, file);
}

export function readIndexMeta(dir) {
  const file = join(dir, META_FILE);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

export function readIndexDocs(dir) {
  const file = join(dir, DOCS_FILE);
  if (!existsSync(file)) return [];
  const turns = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      turns.push(JSON.parse(line));
    } catch {
      // A torn line means an interrupted write; stop rather than index garbage.
      break;
    }
  }
  return turns;
}

export function isFresh(meta, fingerprint) {
  return !!meta && meta.schemaVersion === CACHE_SCHEMA_VERSION && meta.fingerprint === fingerprint;
}

export function writeIndex(dir, { meta, turns }) {
  ensureDir(dir);
  const docs = turns.map((turn) => JSON.stringify(turn)).join('\n');
  writeFileAtomic(join(dir, DOCS_FILE), docs.length ? `${docs}\n` : '');
  writeFileAtomic(join(dir, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);
}

function acquireLock(lock) {
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
    return;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const age = Date.now() - statSync(lock).mtimeMs;
  if (age < LOCK_STALE_MS) throw new CliError(`index is locked by another process: ${lock}`);
  rmSync(lock, { force: true });
  writeFileSync(lock, String(process.pid), { flag: 'wx' });
}

export function withLock(dir, fn) {
  ensureDir(dir);
  const lock = join(dir, LOCK_FILE);
  acquireLock(lock);
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

// Walk the cache root for directories that contain an index, so search/MCP can
// find every harness+scope without knowing the keys in advance.
export function listIndexDirs(root) {
  const dirs = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === META_FILE)) dirs.push(dir);
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return dirs.sort();
}
