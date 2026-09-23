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
  return mkdtempSync(join(tmpdir(), 'visual-shot-term-test-'));
}

test('term --help exits 0 and prints usage', () => {
  const r = run(['term', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /visual-shot term/);
});

test('term with no command exits 2', () => {
  const r = run(['term']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no command given/);
});

test('term unknown option exits 2', () => {
  const r = run(['term', '--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});

test('term invalid --width exits 2 without provisioning', () => {
  const cache = emptyCache();
  try {
    const r = run(['term', '--width', '0', '--', 'echo', 'hi'], { cache });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--width must be greater than 0/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('term --json with no command emits JSON and does not provision', () => {
  const cache = emptyCache();
  try {
    const r = run(['term', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /no command given/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
    assert.equal(existsSync(join(cache, 'browsers')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});
