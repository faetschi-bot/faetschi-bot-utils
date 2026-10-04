import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap } from '../lib/recap/render.mjs';
import { validateRecap } from '../lib/recap/schema.mjs';

// Focused tests for the `json` block (recursive, JS-free tree) and the
// diff-aware additions to `api-endpoint` (root/param/response change + was).
// Deliberately no browser test so this stays fast.

const base = (blocks) => ({ version: 1, title: 'T', blocks });

// --- json: validation -------------------------------------------------------

test('validateRecap accepts a json block with falsy data values and rejects a missing one', () => {
  for (const data of [null, false, 0, '']) {
    const result = validateRecap(base([{ type: 'json', data }]));
    assert.equal(result.ok, true, `data ${JSON.stringify(data)} should be valid`);
    assert.deepEqual(result.errors, []);
  }

  const missing = validateRecap(base([{ type: 'json' }]));
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((e) => e.includes('blocks[0].data is required')));
});

test('validateRecap checks json collapsedDepth bounds and types', () => {
  assert.equal(validateRecap(base([{ type: 'json', data: {}, collapsedDepth: 0 }])).ok, true);

  const negative = validateRecap(base([{ type: 'json', data: {}, collapsedDepth: -1 }]));
  assert.equal(negative.ok, false);
  assert.ok(negative.errors.some((e) => e.includes('collapsedDepth must be a non-negative integer')));

  const fractional = validateRecap(base([{ type: 'json', data: {}, collapsedDepth: 1.5 }]));
  assert.equal(fractional.ok, false);
  assert.ok(fractional.errors.some((e) => e.includes('collapsedDepth must be a non-negative integer')));

  const tooDeep = validateRecap(base([{ type: 'json', data: {}, collapsedDepth: 9999 }]));
  assert.equal(tooDeep.ok, false);
  assert.ok(tooDeep.errors.some((e) => e.includes('collapsedDepth must be at most')));
});

// --- json: rendering --------------------------------------------------------

test('buildRecap renders a json tree with token classes and escaped keys/values', () => {
  const { html } = buildRecap(base([{
    type: 'json',
    title: 'Response <x>',
    data: {
      'user<script>': 'alice<script>alert(1)</script>',
      count: 3,
      ok: false,
      missing: null,
      tags: ['a', 'b'],
    },
  }]));

  assert.match(html, /class="json-title">Response &lt;x&gt;</);
  assert.match(html, /class="jv-key"/);
  assert.match(html, /class="jv-string"/);
  assert.match(html, /class="jv-number"/);
  assert.match(html, /class="jv-bool"/);
  assert.match(html, /class="jv-null"/);
  assert.match(html, /class="jv-index">0</);

  // Structure labels and canonical tokens.
  assert.match(html, /\{5 keys\}/);
  assert.match(html, /\[2 items\]/);
  assert.match(html, /<span class="jv-number">3<\/span>/);
  assert.match(html, /<span class="jv-bool">false<\/span>/);
  assert.match(html, /<span class="jv-null">null<\/span>/);

  // Every key/value is escaped; no raw markup survives.
  assert.match(html, /&quot;user&lt;script&gt;&quot;/);
  assert.match(html, /&quot;alice&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;/);
  assert.doesNotMatch(html, /<script>/);
});

test('buildRecap renders a primitive json root inline without details', () => {
  const { html } = buildRecap(base([{ type: 'json', data: 'hello' }]));
  assert.doesNotMatch(html, /<details/);
  assert.match(html, /<span class="jv-string">&quot;hello&quot;<\/span>/);
});

test('buildRecap opens json nodes by depth and expands everything by default', () => {
  const nested = { a: { b: { c: 1 } } };
  const openCount = (html) => (html.match(/<details class="jv-node" open>/g) ?? []).length;
  const detailCount = (html) => (html.match(/<details class="jv-node"/g) ?? []).length;

  const all = buildRecap(base([{ type: 'json', data: nested }])).html;
  assert.equal(detailCount(all), 3);
  assert.equal(openCount(all), 3);

  const rootOnly = buildRecap(base([{ type: 'json', data: nested, collapsedDepth: 0 }])).html;
  assert.equal(detailCount(rootOnly), 3);
  assert.equal(openCount(rootOnly), 1);

  const oneLevel = buildRecap(base([{ type: 'json', data: nested, collapsedDepth: 1 }])).html;
  assert.equal(openCount(oneLevel), 2);
});

// --- api-endpoint: diff-aware fields ----------------------------------------

test('buildRecap renders api-endpoint change badges and was labels', () => {
  const { html } = buildRecap(base([{
    type: 'api-endpoint',
    method: 'PATCH',
    path: '/v1/users/:id',
    change: 'modified',
    params: [
      { name: 'id', in: 'path', type: 'string', change: 'renamed', was: 'userId' },
      { name: 'email', in: 'body', type: 'string', change: 'added' },
    ],
    responses: [
      { status: 200, description: 'ok', change: 'added', was: '201' },
    ],
  }]));

  assert.match(html, /<span class="chg modified">modified<\/span>/);
  assert.match(html, /<span class="chg renamed">renamed<\/span>/);
  assert.match(html, /<span class="chg added">added<\/span>/);
  assert.match(html, /<span class="muted"> \(was userId\)<\/span>/);
  assert.match(html, /<span class="muted"> \(was 201\)<\/span>/);
});

test('buildRecap marks a removed api-endpoint as removed', () => {
  const { html } = buildRecap(base([{
    type: 'api-endpoint',
    method: 'DELETE',
    path: '/v1/legacy',
    change: 'removed',
  }]));
  assert.match(html, /class="endpoint removed"/);
  assert.match(html, /<span class="chg removed">removed<\/span>/);
});

test('validateRecap enforces api-endpoint change enums and string types', () => {
  const badRoot = validateRecap(base([{ type: 'api-endpoint', method: 'GET', path: '/x', change: 'bogus' }]));
  assert.equal(badRoot.ok, false);
  assert.ok(badRoot.errors.some((e) => e.includes('change must be one of')));

  const badParam = validateRecap(base([{
    type: 'api-endpoint',
    method: 'GET',
    path: '/x',
    params: [{ name: 'id', change: 'bogus', was: 5 }],
  }]));
  assert.equal(badParam.ok, false);
  assert.ok(badParam.errors.some((e) => e.includes('params[0].change must be one of')));
  assert.ok(badParam.errors.some((e) => e.includes('params[0].was must be a string')));

  const badResponse = validateRecap(base([{
    type: 'api-endpoint',
    method: 'GET',
    path: '/x',
    responses: [{ status: 200, change: 'nope' }],
  }]));
  assert.equal(badResponse.ok, false);
  assert.ok(badResponse.errors.some((e) => e.includes('responses[0].change must be one of')));

  const ok = validateRecap(base([{
    type: 'api-endpoint',
    method: 'GET',
    path: '/x',
    change: 'modified',
    params: [{ name: 'id', change: 'added' }],
    responses: [{ status: 200, change: 'removed', was: '201' }],
  }]));
  assert.equal(ok.ok, true);
});
