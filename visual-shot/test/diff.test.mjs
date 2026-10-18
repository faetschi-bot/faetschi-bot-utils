import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheDir } from '../lib/config.mjs';

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));
const provisioned = existsSync(join(cacheDir(), '.provisioned'));

function runAsync(args, { cache, ...env } = {}) {
  const env2 = { ...process.env, ...env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { env: env2 });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function withServer(routes, fn) {
  const server = http.createServer((req, res) => {
    const body = routes[req.url];
    if (body === undefined) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

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

test('diff non-numeric --wait exits 2', () => {
  const r = run(['diff', 'a.png', 'b.png', '--wait', 'soon']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--wait must not be negative/);
});

test('diff --save-inputs without a value exits 2', () => {
  const r = run(['diff', 'a.png', 'b.png', '--save-inputs']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing value for --save-inputs/);
});

test('diff captures both URLs itself and saves the inputs', { skip: provisioned ? false : 'not provisioned' }, async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'visual-shot-diff-url-'));
  try {
    await withServer(
      { '/old': '<h1>before</h1>', '/new': '<h1>after</h1>' },
      async (base) => {
        const out = join(outDir, 'change.png');
        const inputs = join(outDir, 'inputs');
        const r = await runAsync([
          'diff', `${base}/old`, `${base}/new`,
          '--out', out, '--save-inputs', inputs, '--wait', '0', '--json',
        ]);
        assert.equal(r.status, 0, r.stderr);
        const parsed = JSON.parse(r.stdout);
        assert.equal(parsed.ok, true);
        assert.equal(existsSync(out), true);
        assert.equal(existsSync(join(inputs, 'before.png')), true);
        assert.equal(existsSync(join(inputs, 'after.png')), true);
        assert.equal(parsed.savedInputs.before, join(inputs, 'before.png'));
        assert.ok(parsed.changedPixels > 0);
      },
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('diff URL mode fails on page errors unless allowed', { skip: provisioned ? false : 'not provisioned' }, async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'visual-shot-diff-url-'));
  try {
    await withServer(
      { '/clean': '<h1>clean</h1>', '/bad': '<script>console.error("boom")</script>' },
      async (base) => {
        const failed = await runAsync([
          'diff', `${base}/clean`, `${base}/bad`, '--out', join(outDir, 'x.png'), '--wait', '0', '--json',
        ]);
        assert.equal(failed.status, 1);
        const parsed = JSON.parse(failed.stdout);
        assert.equal(parsed.ok, false);
        assert.ok(parsed.consoleErrors.some((e) => e.includes('boom')));

        const allowed = await runAsync([
          'diff', `${base}/clean`, `${base}/bad`, '--out', join(outDir, 'y.png'),
          '--allow-console-error', 'boom', '--wait', '0', '--json',
        ]);
        assert.equal(allowed.status, 0, allowed.stderr);
        assert.equal(JSON.parse(allowed.stdout).ok, true);
      },
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
