import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_RECAP_IMAGE_BYTES } from '../lib/config.mjs';
import { escapeHtml, renderMarkdown } from '../lib/recap/html.mjs';
import { buildRecap, recapCss, TABS_PRINT_CSS } from '../lib/recap/render.mjs';

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
