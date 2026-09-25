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
  return mkdtempSync(join(tmpdir(), 'visual-shot-diff-test-'));
}

test('diff --help exits 0 and prints usage', () => {
  const r = run(['diff', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /visual-shot diff/);
});

test('diff missing positionals exits 2', () => {
  const r = run(['diff']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /missing inputs/);
});

test('diff unknown option exits 2', () => {
  const r = run(['diff', '--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});

test('diff --threshold out of range exits 2 without provisioning', () => {
  const cache = emptyCache();
  try {
    const r = run(['diff', 'a.png', 'b.png', '--threshold', '2'], { cache });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /threshold/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('diff invalid input emits JSON and does not provision', () => {
  const cache = emptyCache();
  try {
    const r = run(['diff', '/nonexistent/a.png', '/nonexistent/b.png', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /input not found/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
    assert.equal(existsSync(join(cache, 'browsers')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('diff directory input exits 2 without provisioning', () => {
  const cache = emptyCache();
  try {
    const r = run(['diff', cache, cache, '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.match(parsed.error, /not a file/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('diff non-numeric --scale exits 2', () => {
  const r = run(['diff', 'a.png', 'b.png', '--scale', 'abc']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--scale must be greater than 0/);
});
