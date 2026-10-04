import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_RECAP_SOURCE_BYTES } from '../lib/config.mjs';

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));

function run(args, { cache, ...env } = {}) {
  const env2 = { ...process.env, ...env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env2 });
}

function emptyCache() {
  return mkdtempSync(join(tmpdir(), 'visual-shot-recap-test-'));
}

function writeJson(dir, value) {
  const file = join(dir, 'recap.json');
  writeFileSync(file, JSON.stringify(value));
  return file;
}

// --- CLI --------------------------------------------------------------------

test('recap --help exits 0 and prints usage', () => {
  const r = run(['recap', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /visual-shot recap/);
});

test('recap with no input exits 2', () => {
  const r = run(['recap']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /missing input/);
});

test('recap with a missing recap file exits 2', () => {
  const r = run(['recap', '--from', '/nonexistent/recap.json']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read recap JSON/);
});

test('recap --from rejects a non-regular file and exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-nonfile-'));
  try {
    // A directory is the portable case; a character device like /dev/null
    // reproduces the /dev/zero/FIFO bypass on Linux when present.
    const targets = [dir];
    if (existsSync('/dev/null')) targets.push('/dev/null');
    for (const target of targets) {
      const r = run(['recap', '--from', target]);
      assert.equal(r.status, 2, `expected exit 2 for ${target}`);
      assert.match(r.stderr, /--from must be a regular file:/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recap --json reports invalid JSON without provisioning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-bad-'));
  const cache = emptyCache();
  try {
    const file = join(dir, 'bad.json');
    writeFileSync(file, '{not json');
    const r = run(['recap', '--from', file, '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /not valid JSON/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test('recap renders HTML without provisioning when no browser features are needed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-html-'));
  const cache = emptyCache();
  try {
    const file = writeJson(dir, {
      version: 1,
      title: 'Offline recap',
      blocks: [
        { type: 'file-tree', entries: [{ path: 'a.ts', change: 'modified' }] },
        { type: 'notes', markdown: 'No code or diagrams here.' },
      ],
    });
    const out = join(dir, 'out.html');
    const r = run(['recap', '--from', file, '--no-highlight', '--out', out, '--json'], { cache });
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(existsSync(out), true);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test('recap --diff renders a file map and inline patches from git', () => {
  const repo = mkdtempSync(join(tmpdir(), 'visual-shot-recap-git-'));
  const outDir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-out-'));
  const cache = emptyCache();
  const git = (args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  try {
    git(['init', '-q', '-b', 'main']);
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
    git(['add', '-A']);
    git(['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'one']);
    writeFileSync(join(repo, 'a.ts'), 'export const a = 2;\n');
    git(['add', '-A']);
    git(['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'two']);

    const out = join(outDir, 'r.html');
    const r = run(['recap', '--diff', 'HEAD~1..HEAD', '--repo', repo, '--no-highlight', '--out', out, '--json'], { cache });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(out, 'utf8');
    assert.match(html, /badge modified/);
    assert.match(html, /class="line add"/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

// --- CLI limits -------------------------------------------------------------

test('recap rejects out-of-range width/scale and an oversized --from file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-limits-'));
  try {
    const file = writeJson(dir, { version: 1, title: 'T', blocks: [{ type: 'notes', markdown: 'x' }] });

    const wide = run(['recap', '--from', file, '--width', '99999']);
    assert.equal(wide.status, 2);
    assert.match(wide.stderr, /--width must be between/);

    const scaled = run(['recap', '--from', file, '--scale', '0']);
    assert.equal(scaled.status, 2);
    assert.match(scaled.stderr, /--scale must be between/);

    const big = join(dir, 'big.json');
    writeFileSync(big, Buffer.alloc(MAX_RECAP_SOURCE_BYTES + 1, 0x20));
    const oversize = run(['recap', '--from', big]);
    assert.equal(oversize.status, 2);
    assert.match(oversize.stderr, /too large/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
