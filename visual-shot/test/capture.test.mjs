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

function run(args, { cache, ...env } = {}) {
  const env2 = { ...process.env, ...env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env2 });
}

// The parent event loop must stay free while the child runs, so the local test
// server can answer the capture (spawnSync would deadlock on itself).
function runAsync(args, { cache, ...env } = {}) {
  const env2 = { ...process.env, ...env };
  delete env2.VISUAL_URL;
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

test('capture --help mentions repeatable --url', () => {
  const r = run(['capture', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--url <url>\s+page to open \(repeatable/);
  assert.match(r.stdout, /--name-prefix/);
});

test('capture rejects --name with multiple --url without provisioning', () => {
  const cache = mkdtempSync(join(tmpdir(), 'visual-shot-capture-test-'));
  try {
    const r = run(['--url', 'http://a/', '--url', 'http://b/', '--name', 'x', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.match(parsed.error, /--name cannot be used with multiple --url/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('capture rejects --out with multiple --url without provisioning', () => {
  const cache = mkdtempSync(join(tmpdir(), 'visual-shot-capture-test-'));
  try {
    const r = run(['--url', 'http://a/', '--url', 'http://b/', '--out', 'x.png', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.match(parsed.error, /--out cannot be used with multiple --url/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('capture rejects an invalid --name-prefix without provisioning', () => {
  const cache = mkdtempSync(join(tmpdir(), 'visual-shot-capture-test-'));
  try {
    const r = run(['--url', 'http://a/', '--url', 'http://b/', '--name-prefix', 'a/b', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.match(parsed.error, /invalid --name-prefix/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('capture --url twice writes numbered PNGs in one run', { skip: provisioned ? false : 'not provisioned' }, async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'visual-shot-capture-out-'));
  try {
    await withServer({ '/one': '<h1>one</h1>', '/two': '<h1>two</h1>' }, async (base) => {
      const r = await runAsync(
        ['--url', `${base}/one`, '--url', `${base}/two`, '--name-prefix', 'pair', '--wait', '0', '--json'],
        { VISUAL_OUT_DIR: outDir },
      );
      assert.equal(r.status, 0, r.stderr);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.captures.length, 2);
      assert.equal(parsed.captures[0].ok, true);
      assert.equal(existsSync(join(outDir, 'pair-1.png')), true);
      assert.equal(existsSync(join(outDir, 'pair-2.png')), true);
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('capture batch error gate flags only the broken URL', { skip: provisioned ? false : 'not provisioned' }, async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'visual-shot-capture-out-'));
  try {
    await withServer(
      { '/ok': '<h1>ok</h1>', '/bad': '<script>console.error("boom")</script>' },
      async (base) => {
        const r = await runAsync(
          ['--url', `${base}/ok`, '--url', `${base}/bad`, '--name-prefix', 'gate', '--wait', '0', '--json'],
          { VISUAL_OUT_DIR: outDir },
        );
        assert.equal(r.status, 1);
        const parsed = JSON.parse(r.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.captures[0].ok, true);
        assert.equal(parsed.captures[1].ok, false);
        assert.ok(parsed.captures[1].consoleErrors.some((e) => e.includes('boom')));
      },
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
