import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISUAL_BLOCK_TYPES, filterRecapByTypes } from '../lib/recap/filter.mjs';

// `--only`/`--visuals-only` narrow a recap to a subset of block types so a GFM
// comment can be paired with a non-redundant "visuals-only" PNG. These tests are
// Node-only: the CLI cases pass an empty cache and never request a browser pass.
// `--visuals-only` with no matching block must not provision.

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));

function run(args, { cache, ...env } = {}) {
  const env2 = { ...process.env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  Object.assign(env2, env);
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env2 });
}

function emptyCache() {
  return mkdtempSync(join(tmpdir(), 'visual-shot-recap-filter-'));
}

function writeJson(dir, value) {
  const file = join(dir, 'recap.json');
  writeFileSync(file, JSON.stringify(value));
  return file;
}

// --- filterRecapByTypes ------------------------------------------------------

test('filterRecapByTypes keeps only matching top-level blocks and preserves recap fields', () => {
  const recap = {
    version: 1,
    title: 'T',
    brief: 'a brief',
    meta: 'a meta line',
    custom: { keep: true },
    blocks: [
      { type: 'notes', markdown: 'drop me' },
      { type: 'wireframe', html: '<div>wf</div>' },
      { type: 'image', src: 'a.png' },
      { type: 'diff', before: '', after: '' },
    ],
  };
  const out = filterRecapByTypes(recap, ['wireframe', 'image']);
  assert.deepEqual(out.blocks.map((b) => b.type), ['wireframe', 'image']);
  assert.equal(out.title, 'T');
  assert.equal(out.brief, 'a brief');
  assert.equal(out.meta, 'a meta line');
  assert.deepEqual(out.custom, { keep: true });
});

test('filterRecapByTypes recurses into columns/tabs and drops containers left empty', () => {
  const recap = {
    version: 1,
    title: 'T',
    blocks: [
      {
        type: 'columns',
        columns: [
          {
            label: 'Before',
            blocks: [
              { type: 'wireframe', html: '<p>before</p>' },
              { type: 'notes', markdown: 'drop' },
            ],
          },
          { label: 'After', blocks: [{ type: 'notes', markdown: 'drop too' }] },
        ],
      },
      { type: 'tabs', tabs: [{ label: 'only notes', blocks: [{ type: 'notes', markdown: 'drop' }] }] },
    ],
  };
  const out = filterRecapByTypes(recap, ['wireframe']);
  assert.equal(out.blocks.length, 1);
  assert.equal(out.blocks[0].type, 'columns');
  assert.deepEqual(out.blocks[0].columns.map((c) => c.label), ['Before']);
  assert.deepEqual(out.blocks[0].columns[0].blocks.map((b) => b.type), ['wireframe']);
});

test('filterRecapByTypes does not mutate its input and returns the recap unchanged for empty types', () => {
  const recap = {
    version: 1,
    title: 'T',
    blocks: [
      {
        type: 'columns',
        columns: [{ label: 'c', blocks: [{ type: 'wireframe', html: 'x' }, { type: 'notes', markdown: 'y' }] }],
      },
      { type: 'notes', markdown: 'top' },
    ],
  };
  const snapshot = structuredClone(recap);

  const out = filterRecapByTypes(recap, ['wireframe']);
  assert.deepEqual(recap, snapshot, 'the source recap is untouched');
  assert.notEqual(out, recap, 'a filtered recap is a new object');
  assert.deepEqual(out.blocks[0].columns[0].blocks.map((b) => b.type), ['wireframe']);

  assert.equal(filterRecapByTypes(recap, []), recap);
  assert.equal(filterRecapByTypes(recap, undefined), recap);
  assert.equal(filterRecapByTypes(recap, null), recap);
});

// --- CLI ---------------------------------------------------------------------

test('recap --visuals-only writes no file and reports blocks: 0 when nothing matches', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-filter-cli-'));
  const cache = emptyCache();
  try {
    const file = writeJson(dir, { version: 1, title: 'Text only', blocks: [{ type: 'notes', markdown: 'hi' }] });
    const out = join(dir, 'visuals.md');
    const r = run(['recap', '--from', file, '--visuals-only', '--format', 'gfm', '--out', out, '--json'], { cache });
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.format, 'gfm');
    assert.equal(parsed.blocks, 0);
    assert.equal(parsed.markdown, null);
    assert.equal(parsed.png, null);
    assert.deepEqual(parsed.only, VISUAL_BLOCK_TYPES);
    assert.ok(parsed.warnings.some((w) => w.includes('no blocks matched --only')));
    assert.equal(existsSync(out), false);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test('recap --only wireframe writes HTML with the wireframe and without filtered blocks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-filter-html-'));
  const cache = emptyCache();
  try {
    const file = writeJson(dir, {
      version: 1,
      title: 'Wireframe only',
      blocks: [
        { type: 'wireframe', html: '<div class="keep-me">WF</div>', caption: 'The mock' },
        { type: 'notes', markdown: 'DROP_THIS_NOTE' },
      ],
    });
    const out = join(dir, 'only.html');
    const r = run(['recap', '--from', file, '--only', 'wireframe', '--no-highlight', '--out', out, '--json'], { cache });
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.blocks, 1);
    assert.deepEqual(parsed.only, ['wireframe']);
    const html = readFileSync(out, 'utf8');
    assert.match(html, /keep-me/);
    assert.doesNotMatch(html, /DROP_THIS_NOTE/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test('recap rejects an unknown --only type and combining --only with --visuals-only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-filter-bad-'));
  const cache = emptyCache();
  try {
    const file = writeJson(dir, { version: 1, title: 'T', blocks: [{ type: 'notes', markdown: 'x' }] });

    const bogus = run(['recap', '--from', file, '--only', 'bogus'], { cache });
    assert.equal(bogus.status, 2);
    assert.match(bogus.stderr, /invalid --only type "bogus"/);

    const both = run(['recap', '--from', file, '--only', 'wireframe', '--visuals-only'], { cache });
    assert.equal(both.status, 2);
    assert.match(both.stderr, /cannot be combined/);

    const container = run(['recap', '--from', file, '--only', 'columns'], { cache });
    assert.equal(container.status, 2);
    assert.match(container.stderr, /cannot target the container type "columns"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});
