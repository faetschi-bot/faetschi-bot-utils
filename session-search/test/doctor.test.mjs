import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor } from '../lib/doctor.mjs';

function isolatedHome() {
  const home = mkdtempSync(join(tmpdir(), 'session-search-doctor-'));
  return {
    home,
    env: {
      HOME: home,
      XDG_STATE_HOME: join(home, 'state'),
      XDG_CACHE_HOME: join(home, 'cache'),
      PI_CODING_AGENT_SESSION_DIR: join(home, 'pi'),
    },
  };
}

function writeIndexMeta(env, meta) {
  const dir = join(env.XDG_CACHE_HOME, 'session-search', 'pi', 'scope');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
}

function status(result, name) {
  return result.checks.find((check) => check.name === name)?.status;
}

function message(result, name) {
  return result.checks.find((check) => check.name === name)?.message;
}

test('doctor is ok with no sources and warns about an empty index', async () => {
  const { home, env } = isolatedHome();
  try {
    const result = await runDoctor({ env, home });
    assert.equal(result.ok, true);
    assert.equal(status(result, 'opencode-source'), 'skip');
    assert.equal(status(result, 'pi-source'), 'skip');
    assert.equal(status(result, 'index'), 'warn');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor probes a registered OpenCode source and warns when it is down', async () => {
  const { home, env } = isolatedHome();
  try {
    const endpoint = { url: 'http://127.0.0.1:1', password: 'p' };
    const up = await runDoctor({ env, home, readEndpoint: () => endpoint, fetchImpl: async () => ({ ok: true, status: 200 }) });
    assert.equal(status(up, 'opencode-source'), 'ok');

    const down = await runDoctor({
      env,
      home,
      readEndpoint: () => endpoint,
      fetchImpl: async () => {
        throw new Error('down');
      },
    });
    assert.equal(status(down, 'opencode-source'), 'warn');
    assert.equal(down.ok, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor fails on an unsupported index schema', async () => {
  const { home, env } = isolatedHome();
  try {
    writeIndexMeta(env, { schemaVersion: 999, fingerprint: 'x', generatedAt: new Date().toISOString() });
    const result = await runDoctor({ env, home });
    assert.equal(result.ok, false);
    assert.equal(status(result, 'index'), 'fail');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor warns on a stale index', async () => {
  const { home, env } = isolatedHome();
  try {
    writeIndexMeta(env, { schemaVersion: 1, fingerprint: 'x', generatedAt: new Date(Date.now() - 60 * 86_400_000).toISOString() });
    const result = await runDoctor({ env, home });
    assert.equal(status(result, 'index'), 'warn');
    assert.equal(result.ok, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor honors an explicit cache root', async () => {
  const { home, env } = isolatedHome();
  try {
    const cacheRoot = join(home, 'custom-cache');
    const result = await runDoctor({ env, home, cacheRoot });
    assert.match(message(result, 'cache'), /custom-cache/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('doctor runs from a package copy without node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'session-search-bare-'));
  const pkg = join(root, 'pkg');
  const home = join(root, 'home');
  try {
    mkdirSync(pkg);
    mkdirSync(home);
    for (const entry of ['bin', 'lib', 'skills', 'package.json']) {
      cpSync(fileURLToPath(new URL(`../${entry}`, import.meta.url)), join(pkg, entry), { recursive: true });
    }
    const result = spawnSync(process.execPath, [join(pkg, 'bin', 'session-search.mjs'), 'doctor', '--json'], {
      encoding: 'utf8',
      env: {
        HOME: home,
        XDG_STATE_HOME: join(home, 'state'),
        XDG_CACHE_HOME: join(home, 'cache'),
        PI_CODING_AGENT_SESSION_DIR: join(home, 'pi'),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(status(parsed, 'dependencies'), 'warn');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
