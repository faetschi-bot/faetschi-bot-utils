import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
