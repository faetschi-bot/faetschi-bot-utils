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
  return mkdtempSync(join(tmpdir(), 'visual-shot-diagram-test-'));
}

test('diagram --help exits 0 and prints usage', () => {
  const r = run(['diagram', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /visual-shot diagram/);
});

test('diagram missing input exits 2', () => {
  const r = run(['diagram']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /missing input/);
});

test('diagram nonexistent input exits 2', () => {
  const r = run(['diagram', '/nonexistent/nope.mmd']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /input not found/);
});

test('diagram unsupported extension exits 2', () => {
  const r = run(['diagram', 'foo.txt']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unsupported input/);
});

test('diagram invalid --format exits 2', () => {
  const r = run(['diagram', 'a.mmd', '--format', 'gif']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /invalid --format/);
});

test('diagram unknown option exits 2', () => {
  const r = run(['diagram', '--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});

test('diagram missing value exits 2', () => {
  const r = run(['diagram', '--out']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing value/);
});

test('diagram --json with a bad input emits JSON and does not provision', () => {
  const cache = emptyCache();
  try {
    const r = run(['diagram', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /missing input/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
    assert.equal(existsSync(join(cache, 'browsers')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});
