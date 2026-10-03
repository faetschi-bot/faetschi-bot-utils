import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleRecap } from '../lib/recap/assemble.mjs';
import { classifyPatchLine, computeLineDiff, parseLineRange } from '../lib/recap/diff.mjs';
import { parseNameStatus } from '../lib/recap/git.mjs';
import { escapeHtml, renderMarkdown } from '../lib/recap/html.mjs';
import { buildRecap } from '../lib/recap/render.mjs';
import { validateRecap } from '../lib/recap/schema.mjs';

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

// --- schema -----------------------------------------------------------------

test('validateRecap accepts a minimal valid recap', () => {
  const result = validateRecap({
    version: 1,
    title: 'T',
    blocks: [{ type: 'notes', markdown: 'hi' }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateRecap rejects unknown block types and missing required fields', () => {
  const result = validateRecap({
    version: 1,
    title: 'T',
    blocks: [
      { type: 'nope' },
      { type: 'diff', before: 'a' },
      { type: 'file-tree', entries: [] },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('blocks[0].type "nope"')));
  assert.ok(result.errors.some((e) => e.includes('blocks[1].after')));
  assert.ok(result.errors.some((e) => e.includes('blocks[2].entries')));
});

test('validateRecap descends into columns and tabs blocks', () => {
  const result = validateRecap({
    version: 1,
    title: 'T',
    blocks: [{ type: 'tabs', tabs: [{ label: 'a', blocks: [{ type: 'callout' }] }] }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('blocks[0].tabs[0].blocks[0].body')));
});

test('validateRecap requires a title and a non-empty blocks array', () => {
  assert.equal(validateRecap({ version: 1, blocks: [] }).ok, false);
  assert.equal(validateRecap({ version: 1, title: 'T', blocks: [] }).ok, false);
  assert.ok(validateRecap({ version: 1, title: 'T' }).errors.includes('blocks must be a non-empty array'));
});

// --- diff -------------------------------------------------------------------

test('computeLineDiff marks added, removed, changed, and context rows', () => {
  const { rows } = computeLineDiff('a\nb\nc\n', 'a\nB\nc\nd\n');
  const kinds = rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['context', 'changed', 'context', 'added']);
  const changed = rows[1];
  assert.equal(changed.left.text, 'b');
  assert.equal(changed.right.text, 'B');
  assert.equal(changed.left.n, 2);
  assert.equal(changed.right.n, 2);
});

test('computeLineDiff aligns a pure insertion as an added-only row', () => {
  const { rows } = computeLineDiff('a\n', 'a\nnew\n');
  assert.equal(rows[1].kind, 'added');
  assert.equal(rows[1].left, null);
  assert.equal(rows[1].right.n, 2);
});

test('parseLineRange parses singles and inclusive ranges, rejects junk', () => {
  assert.deepEqual(parseLineRange('4'), [4]);
  assert.deepEqual(parseLineRange('2-5'), [2, 3, 4, 5]);
  assert.deepEqual(parseLineRange('5-2'), []);
  assert.deepEqual(parseLineRange('x'), []);
});

test('classifyPatchLine distinguishes meta, hunk, add, remove, and context', () => {
  assert.equal(classifyPatchLine('diff --git a/x b/x'), 'meta');
  assert.equal(classifyPatchLine('@@ -1 +1 @@'), 'hunk');
  assert.equal(classifyPatchLine('+added'), 'added');
  assert.equal(classifyPatchLine('-removed'), 'removed');
  assert.equal(classifyPatchLine(' context'), 'context');
});

// --- git --------------------------------------------------------------------

test('parseNameStatus maps status codes and rename columns', () => {
  const entries = parseNameStatus('M\tserver/a.ts\nD\told.ts\nR100\told/x.ts\tnew/x.ts\n');
  assert.deepEqual(entries, [
    { path: 'server/a.ts', change: 'modified' },
    { path: 'old.ts', change: 'removed' },
    { path: 'new/x.ts', change: 'renamed' },
  ]);
});

// --- assemble ---------------------------------------------------------------

test('assembleRecap adds a file map and inline patches from a git diff', () => {
  const gitData = {
    entries: [{ path: 'a.ts', change: 'modified' }],
    patches: new Map([['a.ts', 'diff --git a/a.ts b/a.ts\n+new\n']]),
    total: 1,
    truncated: false,
  };
  const { recap } = assembleRecap({ range: 'main...HEAD', gitData });
  assert.equal(recap.blocks[0].type, 'file-tree');
  assert.equal(recap.blocks[0].entries[0].path, 'a.ts');
  assert.equal(recap.blocks[1].type, 'tabs');
  assert.equal(recap.blocks[1].tabs[0].blocks[0].type, 'patch');
});

test('assembleRecap does not duplicate an author-provided file tree', () => {
  const gitData = {
    entries: [{ path: 'a.ts', change: 'modified' }],
    patches: new Map(),
    total: 1,
    truncated: false,
  };
  const { recap } = assembleRecap({
    from: { version: 1, title: 'T', blocks: [{ type: 'file-tree', entries: [{ path: 'x', change: 'added' }] }] },
    gitData,
  });
  assert.equal(recap.blocks.filter((b) => b.type === 'file-tree').length, 1);
  assert.equal(recap.blocks[0].entries[0].path, 'x');
});

test('assembleRecap warns when patches are truncated', () => {
  const gitData = {
    entries: [],
    patches: new Map([['a.ts', 'x']]),
    total: 40,
    truncated: true,
  };
  const { warnings } = assembleRecap({ range: 'x', gitData });
  assert.ok(warnings.some((w) => w.includes('limited to 1 of 40')));
});

// --- html helpers -----------------------------------------------------------

test('escapeHtml neutralizes markup in text and attributes', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('renderMarkdown renders headings, lists, emphasis, code, and links', () => {
  const html = renderMarkdown('## Hi\n\n- a **b** `c`\n- [d](https://e.f)\n');
  assert.match(html, /<h2>Hi<\/h2>/);
  assert.match(html, /<li>a <strong>b<\/strong> <code>c<\/code><\/li>/);
  assert.match(html, /<a href="https:\/\/e.f">d<\/a>/);
});

// --- rendering --------------------------------------------------------------

test('buildRecap escapes content, flags changes, and records mermaid sources', () => {
  const { html, mermaid } = buildRecap({
    version: 1,
    title: 'Title <x>',
    blocks: [
      { type: 'file-tree', entries: [{ path: 'a<script>.ts', change: 'added' }] },
      { type: 'mermaid', source: 'graph TD; A-->B' },
    ],
  });
  assert.match(html, /Title &lt;x&gt;/);
  assert.match(html, /badge added/);
  assert.match(html, /a&lt;script&gt;\.ts/);
  assert.match(html, /data-mermaid-id="mermaid-1"/);
  assert.equal(mermaid.length, 1);
});

test('buildRecap marks removed and added diff lines', () => {
  const { html } = buildRecap({
    version: 1,
    title: 'T',
    blocks: [{ type: 'diff', before: 'keep\nold\n', after: 'keep\nnew\n' }],
  });
  assert.match(html, /class="line rem"/);
  assert.match(html, /class="line add"/);
  assert.match(html, /class="line context"|class="line "/);
});

test('buildRecap inlines a local image and warns on a missing one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-img-'));
  try {
    const png = join(dir, 'a.png');
    writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
    const { html, warnings } = buildRecap({
      version: 1,
      title: 'T',
      blocks: [
        { type: 'image', src: png },
        { type: 'image', src: join(dir, 'missing.png') },
      ],
    });
    assert.match(html, /data:image\/png;base64,/);
    assert.ok(warnings.some((w) => w.includes('missing.png')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
