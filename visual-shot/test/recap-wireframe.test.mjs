import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap } from '../lib/recap/render.mjs';
import { validateRecap } from '../lib/recap/schema.mjs';

// Focused tests for the wireframe block: validation, surface/height rendering,
// iframe isolation, and before/after via columns. Deliberately no browser test
// so this stays fast.

const base = (blocks) => ({ version: 1, title: 'T', blocks });

// `srcdoc` is attribute-escaped; decode it to inspect the iframe's real
// document. `&amp;` must be decoded last so a literal `&amp;lt;` is not
// double-decoded.
function decodeAttr(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Every srcdoc document in the output, in document order.
function srcdocs(html) {
  return [...html.matchAll(/srcdoc="([^"]*)"/g)].map((m) => decodeAttr(m[1]));
}

// The top-level document with each srcdoc attribute removed, so a leak of
// author CSS/HTML into the report itself can be detected.
function withoutSrcdoc(html) {
  return html.replace(/ srcdoc="[^"]*"/g, '');
}

test('validateRecap accepts a minimal wireframe', () => {
  const result = validateRecap(base([{ type: 'wireframe', html: '<div>hi</div>' }]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateRecap rejects a wireframe without html', () => {
  const result = validateRecap(base([{ type: 'wireframe' }]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('blocks[0].html is required')));
});

test('validateRecap rejects an unknown wireframe surface', () => {
  const result = validateRecap(base([{ type: 'wireframe', html: '<div/>', surface: 'watch' }]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('surface must be one of')));
});

test('validateRecap rejects a non-positive or non-integer wireframe height', () => {
  for (const height of [0, -120, 1.5, '560', null]) {
    const result = validateRecap(base([{ type: 'wireframe', html: '<div/>', height }]));
    assert.equal(result.ok, false, `height ${JSON.stringify(height)} should be rejected`);
    assert.ok(
      result.errors.some((e) => e.includes('height must be a positive integer')),
      `height ${JSON.stringify(height)} should report a positive-integer error`,
    );
  }
});

test('validateRecap rejects an oversized wireframe height', () => {
  const result = validateRecap(base([{ type: 'wireframe', html: '<div/>', height: 2001 }]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('height must be at most 2000')));
});

test('buildRecap renders a sandboxed wireframe iframe with escaped author html/css and caption', () => {
  const { html } = buildRecap(base([{
    type: 'wireframe',
    surface: 'mobile',
    html: '<div class="mock">Hi</div>',
    css: '.mock { color: red; }',
    caption: 'State <b>after</b>',
  }]));
  assert.match(html, /class="wf wf-mobile"/);
  assert.match(html, /<iframe class="wf-body" sandbox srcdoc="/);
  assert.doesNotMatch(html, /loading="lazy"/);
  assert.match(html, /State &lt;b&gt;after&lt;\/b&gt;/);
  // Author html is not raw in the report; it is attribute-escaped inside srcdoc.
  assert.ok(html.includes('&lt;div class=&quot;mock&quot;&gt;Hi&lt;/div&gt;'));
  const [doc] = srcdocs(html);
  assert.ok(doc.startsWith('<!doctype html><html><head><meta charset="utf-8"><style>'));
  assert.ok(doc.includes('<div class="mock">Hi</div>'));
  assert.ok(doc.includes('.mock { color: red; }'));
  assert.ok(doc.includes('background:#fff;color:#1f2328'));
  assert.ok(doc.endsWith('</body></html>'));
});

test('buildRecap defaults the wireframe surface to browser and a per-surface height', () => {
  const { html } = buildRecap(base([{ type: 'wireframe', html: '<p>x</p>' }]));
  assert.match(html, /class="wf wf-browser"/);
  assert.match(html, /style="height:560px"/);
});

test('buildRecap uses the tablet default height when none is given', () => {
  const { html } = buildRecap(base([{ type: 'wireframe', html: '<p>x</p>', surface: 'tablet' }]));
  assert.match(html, /style="height:720px"/);
});

test('buildRecap honors a valid custom wireframe height', () => {
  const { html } = buildRecap(base([{ type: 'wireframe', html: '<p>x</p>', height: 432 }]));
  assert.match(html, /style="height:432px"/);
});

test('buildRecap renders a before/after wireframe pair inside columns', () => {
  const { html } = buildRecap(base([{
    type: 'columns',
    columns: [
      { label: 'Before', blocks: [{ type: 'wireframe', surface: 'mobile', html: '<p>before</p>' }] },
      { label: 'After', blocks: [{ type: 'wireframe', surface: 'desktop', html: '<p>after</p>' }] },
    ],
  }]));
  assert.match(html, /class="wf wf-mobile"/);
  assert.match(html, /class="wf wf-desktop"/);
  assert.equal(srcdocs(html).length, 2);
  const docs = srcdocs(html);
  assert.ok(docs.some((d) => d.includes('<p>before</p>')));
  assert.ok(docs.some((d) => d.includes('<p>after</p>')));
});

test('wireframe author CSS is isolated to its own srcdoc and never leaks top-level', () => {
  const { html } = buildRecap(base([{
    type: 'columns',
    columns: [
      { label: 'Before', blocks: [{ type: 'wireframe', html: '<div class="pane">a</div>', css: '.pane-before { color: crimson; }' }] },
      { label: 'After', blocks: [{ type: 'wireframe', html: '<div class="pane">b</div>', css: '.pane-after { color: teal; }' }] },
    ],
  }]));
  const docs = srcdocs(html);
  assert.equal(docs.length, 2);
  assert.ok(docs.some((d) => d.includes('.pane-before { color: crimson; }')));
  assert.ok(docs.some((d) => d.includes('.pane-after { color: teal; }')));
  // Neither stylesheet reaches the top-level document, so one pane cannot
  // restyle the other (last-stylesheet-wins) or the report chrome.
  const topLevel = withoutSrcdoc(html);
  assert.doesNotMatch(topLevel, /crimson/);
  assert.doesNotMatch(topLevel, /teal/);
  assert.doesNotMatch(topLevel, /\.pane-before/);
  assert.doesNotMatch(topLevel, /\.pane-after/);
});
