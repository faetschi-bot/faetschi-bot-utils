import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));

function run(args, { cache, ...env } = {}) {
  const env2 = { ...process.env, ...env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env2 });
}

function emptyCache() {
  return mkdtempSync(join(tmpdir(), 'visual-shot-test-'));
}

test('--help exits 0 and prints usage', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test('unknown option exits 2', () => {
  const r = run(['--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});

test('missing value exits 2', () => {
  const r = run(['--name']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing value/);
});

test('doctor --json on an empty cache reports not-ok without provisioning', () => {
  const cache = emptyCache();
  try {
    const r = run(['doctor', '--json'], { cache });
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.checks.some((c) => c.name === 'node' && c.ok === true));
    assert.ok(parsed.checks.some((c) => c.name === 'provisioned' && c.ok === false));
    assert.equal(existsSync(join(cache, '.provisioned')), false);
    assert.equal(existsSync(join(cache, 'browsers')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('invalid --header emits JSON and exits 2 without provisioning', () => {
  const cache = emptyCache();
  try {
    const r = run(['--header', 'no-colon', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /Invalid --header/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('invalid --viewport emits JSON and exits 2 without provisioning', () => {
  const cache = emptyCache();
  try {
    const r = run(['--viewport', 'nope', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /invalid --viewport/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('non-positive --scale emits JSON and exits 2 without provisioning', () => {
  const cache = emptyCache();
  try {
    const r = run(['--scale', '-1', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /--scale must be greater than 0/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});
