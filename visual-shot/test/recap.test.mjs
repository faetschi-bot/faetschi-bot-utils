import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cacheDir,
  MAX_RECAP_ANNOTATION_LINES,
  MAX_RECAP_BLOCKS,
  MAX_RECAP_IMAGE_BYTES,
  MAX_RECAP_SOURCE_BYTES,
} from '../lib/config.mjs';
import { highlightAssetPath } from '../lib/highlight.mjs';
import { mermaidAssetPath } from '../lib/mermaid.mjs';
import { assembleRecap } from '../lib/recap/assemble.mjs';
import { classifyPatchLine, computeLineDiff, parseLineRange } from '../lib/recap/diff.mjs';
import { assertValidRange, parseNameStatus, truncatePatch } from '../lib/recap/git.mjs';
import { escapeHtml, renderMarkdown } from '../lib/recap/html.mjs';
import { buildRecap, recapCss, TABS_PRINT_CSS } from '../lib/recap/render.mjs';
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

test('validateRecap rejects a recap nested beyond the depth limit without throwing', () => {
  // Build columns nested far past the guard so recursion would otherwise
  // overflow the call stack; expect a normal validation error, not a RangeError.
  let block = { type: 'notes', markdown: 'leaf' };
  for (let i = 0; i < 40; i++) {
    block = { type: 'columns', columns: [{ blocks: [block] }] };
  }
  const result = validateRecap({ version: 1, title: 'T', blocks: [block] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('exceeds maximum nesting depth')));
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
    }, { assetRoot: dir, maxImageBytes: MAX_RECAP_IMAGE_BYTES });
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

// --- security regressions ---------------------------------------------------

// A recap JSON is untrusted. An out-of-enum `change` must render inert: no
// attribute break-out, no injected tag, and no badge class — while a valid value
// still gets its badge.
test('buildRecap neutralizes a data-model change payload and still badges valid changes', () => {
  const payload = 'x"><img src=y onerror=alert(1)>';
  const { html } = buildRecap({
    version: 1,
    title: 'T',
    blocks: [{
      type: 'data-model',
      entities: [{ name: 'users', fields: [{ name: 'id', type: 'uuid', change: payload }] }],
    }],
  });
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /class="chg/);
  assert.doesNotMatch(html, /onerror/);

  const valid = buildRecap({
    version: 1,
    title: 'T',
    blocks: [{
      type: 'data-model',
      entities: [{ name: 'users', fields: [{ name: 'id', type: 'uuid', change: 'added' }] }],
    }],
  }).html;
  assert.match(valid, /<span class="chg added">added<\/span>/);
});

// Own-property badge lookup: `__proto__`/`constructor` must not resolve to an
// inherited value or leak into a class attribute.
test('buildRecap treats an unknown file-tree change as modified without prototype lookup', () => {
  const { html } = buildRecap({
    version: 1,
    title: 'T',
    blocks: [{
      type: 'file-tree',
      entries: [
        { path: 'a.ts', change: '__proto__' },
        { path: 'b.ts', change: 'constructor' },
      ],
    }],
  });
  assert.equal((html.match(/class="badge modified"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /class="badge (__proto__|constructor)"/);
  assert.doesNotMatch(html, /__proto__/);
});

test('buildRecap inlines only images inside the asset root and rejects oversize/non-image files', () => {
  const root = mkdtempSync(join(tmpdir(), 'visual-shot-recap-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'visual-shot-recap-outside-'));
  try {
    const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex');
    writeFileSync(join(root, 'ok.png'), pngBytes);
    writeFileSync(join(outside, 'secret.png'), pngBytes);
    writeFileSync(join(root, 'big.png'), Buffer.alloc(64));
    writeFileSync(join(root, 'notes.txt'), 'hello');
    const relativeEscape = join('..', outside.slice(outside.lastIndexOf('/') + 1), 'secret.png');

    const inline = (src, options) => buildRecap(
      { version: 1, title: 'T', blocks: [{ type: 'image', src }] },
      { assetRoot: root, maxImageBytes: MAX_RECAP_IMAGE_BYTES, ...options },
    );

    const inside = inline('ok.png');
    assert.match(inside.html, /data:image\/png;base64,/);

    const absolute = inline(join(outside, 'secret.png'));
    assert.doesNotMatch(absolute.html, /data:image/);
    assert.ok(absolute.warnings.some((w) => w.includes('outside the asset root')));

    const relative = inline(relativeEscape);
    assert.doesNotMatch(relative.html, /data:image/);
    assert.ok(relative.warnings.some((w) => w.includes('outside the asset root')));

    const oversize = inline('big.png', { maxImageBytes: 8 });
    assert.doesNotMatch(oversize.html, /data:image/);
    assert.ok(oversize.warnings.some((w) => w.includes('too large')));

    const wrongType = inline('notes.txt');
    assert.doesNotMatch(wrongType.html, /data:image/);
    assert.ok(wrongType.warnings.some((w) => w.includes('unsupported image type')));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// --- tab rendering ----------------------------------------------------------

test('recapCss emits a rule for maxTabs and buildRecap counts nested tabs', () => {
  assert.match(recapCss({ maxTabs: 13 }), /nth-of-type\(13\)/);

  const tabs = Array.from({ length: 13 }, (_, i) => ({
    label: `Tab ${i + 1}`,
    blocks: [{ type: 'notes', markdown: 'x' }],
  }));
  const { html, maxTabs } = buildRecap({
    version: 1,
    title: 'T',
    blocks: [{ type: 'columns', columns: [{ blocks: [{ type: 'tabs', tabs }] }] }],
  });
  assert.equal(maxTabs, 13);
  assert.match(html, /data-label=/);
});

test('TABS_PRINT_CSS reveals every tab panel in the PNG pass', () => {
  assert.equal(typeof TABS_PRINT_CSS, 'string');
  assert.ok(TABS_PRINT_CSS.length > 0);
  assert.match(TABS_PRINT_CSS, /\.tab-panels[^}]*\.panel[^}]*display:\s*block/);
});

// --- content regressions ----------------------------------------------------

test('buildRecap strips CRLF from code blocks', () => {
  const { html } = buildRecap({
    version: 1,
    title: 'T',
    blocks: [{ type: 'code', language: 'js', code: 'const a = 1;\r\nconst b = 2;\r\n' }],
  });
  assert.doesNotMatch(html, /\r/);
  assert.match(html, /const a = 1;/);
});

test('buildRecap marks annotated lines in a unified diff', () => {
  const { html } = buildRecap({
    version: 1,
    title: 'T',
    blocks: [{
      type: 'diff',
      mode: 'unified',
      before: 'old\n',
      after: 'new\n',
      annotations: [{ lines: '1', side: 'after' }],
    }],
  });
  assert.match(html, /class="mark"/);
});

test('buildRecap grounds a data-model field note and foreign-key target', () => {
  const { html } = buildRecap({
    version: 1,
    title: 'T',
    blocks: [{
      type: 'data-model',
      entities: [{
        name: 'orders',
        fields: [{ name: 'user_id', type: 'uuid', fk: 'users.id', note: 'indexed for lookups' }],
      }],
    }],
  });
  assert.match(html, /indexed for lookups/);
  assert.match(html, /FK &rarr; users\.id/);
});

// --- validation limits ------------------------------------------------------

test('validateRecap rejects out-of-enum values and oversized annotations/blocks', () => {
  const base = (blocks) => ({ version: 1, title: 'T', blocks });

  const badChange = validateRecap(base([{ type: 'file-tree', entries: [{ path: 'a', change: 'bogus' }] }]));
  assert.equal(badChange.ok, false);
  assert.ok(badChange.errors.some((e) => e.includes('change must be one of')));

  const badTone = validateRecap(base([{ type: 'callout', body: 'x', tone: 'loud' }]));
  assert.equal(badTone.ok, false);
  assert.ok(badTone.errors.some((e) => e.includes('tone must be one of')));

  const badMode = validateRecap(base([{ type: 'diff', before: '', after: '', mode: 'sideways' }]));
  assert.equal(badMode.ok, false);
  assert.ok(badMode.errors.some((e) => e.includes('mode must be')));

  const badSide = validateRecap(base([{
    type: 'diff',
    before: '',
    after: '',
    annotations: [{ lines: '1', side: 'middle' }],
  }]));
  assert.equal(badSide.ok, false);
  assert.ok(badSide.errors.some((e) => e.includes('side must be')));

  const tooManyLines = validateRecap(base([{
    type: 'diff',
    before: '',
    after: '',
    annotations: [{ lines: `1-${MAX_RECAP_ANNOTATION_LINES + 1}` }],
  }]));
  assert.equal(tooManyLines.ok, false);
  assert.ok(tooManyLines.errors.some((e) => e.includes('exceeds')));

  const tooManyBlocks = validateRecap(base(
    Array.from({ length: MAX_RECAP_BLOCKS + 1 }, () => ({ type: 'notes', markdown: 'x' })),
  ));
  assert.equal(tooManyBlocks.ok, false);
  assert.ok(tooManyBlocks.errors.some((e) => e.includes('at most')));
});

// --- git guards -------------------------------------------------------------

test('assertValidRange rejects option-like ranges and truncatePatch keeps UTF-8 on a boundary', () => {
  assert.throws(() => assertValidRange('--output=/tmp/x'), /invalid --diff range/);
  assert.equal(assertValidRange('main...HEAD'), 'main...HEAD');
  assert.throws(() => assertValidRange('main HEAD'), /whitespace/);

  const suffix = '\n… truncated\n';
  const text = `${'é'.repeat(64)}\nsecond line\n`;
  const maxBytes = 9;
  const out = truncatePatch(text, maxBytes);
  assert.doesNotMatch(out, /\uFFFD/);
  assert.ok(out.endsWith('truncated\n'));
  assert.ok(Buffer.byteLength(out, 'utf8') <= maxBytes + Buffer.byteLength(suffix, 'utf8'));

  assert.equal(truncatePatch('tiny', 100), 'tiny');
});

// --- assemble ---------------------------------------------------------------

test('assembleRecap lets --title override --from and warns on an empty diff', () => {
  const from = { version: 1, title: 'Original', blocks: [{ type: 'notes', markdown: 'x' }] };
  const overridden = assembleRecap({ from, title: 'From CLI' });
  assert.equal(overridden.recap.title, 'From CLI');

  const empty = assembleRecap({
    range: 'main...HEAD',
    gitData: { entries: [], patches: new Map(), total: 0, truncated: false },
  });
  assert.ok(empty.warnings.some((w) => w.includes('no changes')));
  assert.equal(empty.recap.blocks.some((b) => b.type === 'file-tree' || b.type === 'tabs'), false);
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
