import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheDir } from '../lib/config.mjs';
import { highlightAssetPath } from '../lib/highlight.mjs';
import { mermaidAssetPath } from '../lib/mermaid.mjs';

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));

function run(args, { cache, ...env } = {}) {
  const env2 = { ...process.env, ...env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env2 });
}

function writeJson(dir, value) {
  const file = join(dir, 'recap.json');
  writeFileSync(file, JSON.stringify(value));
  return file;
}

// --- browser integration (gated: no network, no provisioning) ---------------

const sharedCache = cacheDir();
const browserAssetsReady = existsSync(join(sharedCache, '.provisioned'))
  && existsSync(mermaidAssetPath(sharedCache))
  && existsSync(highlightAssetPath(sharedCache));

test('recap --png bakes mermaid and highlight into the HTML', { skip: browserAssetsReady ? false : 'assets not provisioned' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-png-'));
  try {
    const file = writeJson(dir, {
      version: 1,
      title: 'Browser recap',
      blocks: [
        { type: 'mermaid', source: 'graph TD; A-->B' },
        { type: 'code', language: 'js', code: 'const x = 1;\n' },
      ],
    });
    const out = join(dir, 'out.html');
    const r = run(['recap', '--from', file, '--png', '--out', out, '--json'], { cache: sharedCache });
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.png);
    assert.equal(existsSync(parsed.png), true);
    const html = readFileSync(parsed.html, 'utf8');
    assert.match(html, /<svg/);
    assert.match(html, /hljs-/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
