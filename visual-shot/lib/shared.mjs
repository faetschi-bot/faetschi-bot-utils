import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors.mjs';

const require = createRequire(import.meta.url);

export const libDir = dirname(fileURLToPath(import.meta.url));
export const scriptsDir = join(libDir, '..', 'scripts');
export const commandsDir = join(libDir, 'commands');

export const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function positive(value, fallback, flag) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new CliError(`--${flag} must be greater than 0 (got ${value})`);
  }
  return n;
}

export function nonNegative(value, fallback, flag) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new CliError(`--${flag} must not be negative (got ${value})`);
  }
  return n;
}

export function parseHeaders(list) {
  const headers = {};
  for (const raw of list) {
    const idx = raw.indexOf(':');
    if (idx === -1) throw new CliError(`Invalid --header (expected "Name: value"): ${raw}`);
    headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  }
  return headers;
}

export function matchesAny(text, patterns) {
  for (const p of patterns) {
    if (text.includes(p)) return true;
    try {
      if (new RegExp(p).test(text)) return true;
    } catch {
      /* not a valid regex and not a substring; ignore this pattern */
    }
  }
  return false;
}

export function applyEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

export function findFile(root, name) {
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === name) return p;
    }
  }
  return null;
}

export function loadPlaywright(cache) {
  for (const candidate of ['playwright', join(cache, 'pw/node_modules/playwright')]) {
    try {
      return require(candidate);
    } catch {
      /* try the next location */
    }
  }
  return null;
}

export function ensureDir(file) {
  try {
    mkdirSync(dirname(file), { recursive: true });
  } catch (e) {
    throw new CliError(`cannot create output directory ${dirname(file)}: ${e.message}`, 1);
  }
}

export function runProvision(cache, { quietStdout = false } = {}) {
  process.env.VISUAL_SHOT_CACHE = cache;
  // In --json mode, route the provisioning script's stdout to stderr so the
  // machine-readable result on stdout stays parseable on a cold cache.
  const stdio = quietStdout ? ['ignore', process.stderr, process.stderr] : 'inherit';
  const r = spawnSync('bash', [join(scriptsDir, 'provision.sh')], { stdio, env: process.env });
  if (r.status !== 0) throw new CliError('provisioning failed', 1);
}

export function ensureProvisioned(cache, { json = false } = {}) {
  if (existsSync(join(cache, '.provisioned'))) return;
  console.error('[visual-shot] first run: provisioning Chromium + libraries (this can take a few minutes)...');
  runProvision(cache, { quietStdout: json });
}

export async function launchBrowser(chromium) {
  return chromium.launch({ headless: true, args: CHROMIUM_ARGS });
}

export async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(5000, remaining)),
      });
      if (res.status < 500) return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `server not reachable at ${url} within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`,
  );
}

export async function downloadFile(url, dest) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  ensureDir(dest);
  writeFileSync(dest, buf);
  return dest;
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// True when the file matches the expected digest. A null/undefined expected
// digest means "no pin" (a version overridden via env), which always passes.
// Any read error is a failed check so callers re-download rather than trust it.
export function verifyFileSha256(path, expected) {
  if (!expected) return true;
  try {
    return sha256File(path) === expected;
  } catch {
    return false;
  }
}

// Download an asset and only publish it to `dest` when its SHA-256 matches the
// pin. A tampered or corrupted response must never reach the cache, so an
// explicit `expectedSha256` fails closed; a null pin (custom version) skips the
// check but still downloads. On any failure the partial file is removed.
export async function downloadVerified(url, dest, expectedSha256, what = 'asset') {
  let buf;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw new CliError(`failed to download ${what} from ${url}: ${e.message}`, 1);
  }

  if (expectedSha256) {
    const actual = createHash('sha256').update(buf).digest('hex');
    if (actual !== expectedSha256) {
      throw new CliError(
        `${what} from ${url} failed SHA-256 verification `
          + `(expected ${expectedSha256}, got ${actual}); refusing to use it`,
        1,
      );
    }
  }

  ensureDir(dest);
  try {
    writeFileSync(dest, buf);
  } catch (e) {
    try {
      rmSync(dest, { force: true });
    } catch {
      /* best-effort cleanup of the partial file */
    }
    throw new CliError(`failed to write ${what} to ${dest}: ${e.message}`, 1);
  }
  return dest;
}
