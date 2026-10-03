import { escapeHtml } from './html.mjs';
import { MAX_JSON_COLLAPSED_DEPTH } from './schema.mjs';

// Rendering for the `json` block: a recursive, JS-free collapsible tree built
// from <details>/<summary>. The recap JSON is untrusted, so every key and value
// is escaped and the recursion is depth-capped; nothing is executed and the PNG
// pass sees the whole structure because the default expands every node.

// Hard ceiling on recursion so a pathologically nested `data` value cannot
// overflow the call stack. Independent of collapsedDepth, which only controls
// the initial open state.
const MAX_JSON_RENDER_DEPTH = 100;

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

// An object node is `{N keys}`, an array `[N items]`.
function countLabel(value) {
  return Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value).length} keys}`;
}

// One escaped primitive token. `JSON.stringify` gives canonical quoting/escaping
// for strings and numbers; the result is still HTML-escaped so `<`, `>`, `&`,
// quotes, and apostrophes cannot break out of text or an attribute.
function primitive(value) {
  if (value === null) return '<span class="jv-null">null</span>';
  switch (typeof value) {
    case 'string':
    case 'number':
      return `<span class="jv-${typeof value}">${escapeHtml(JSON.stringify(value))}</span>`;
    case 'boolean':
      return `<span class="jv-bool">${value ? 'true' : 'false'}</span>`;
    default:
      // undefined/function/symbol cannot come from JSON but may be passed
      // programmatically; render them inertly rather than throwing.
      return `<span class="jv-null">${escapeHtml(String(value))}</span>`;
  }
}

// A key label is quoted like JSON; an array index is shown unquoted and muted.
function keyLabel(key, isIndex) {
  return isIndex
    ? `<span class="jv-index">${escapeHtml(String(key))}</span>`
    : `<span class="jv-key">${escapeHtml(JSON.stringify(key))}</span>`;
}

// Recursively render one value. Containers become a <details> that is `open`
// when this depth is within collapsedDepth; a container's summary shows only its
// count, while the caller renders the key/index before it.
function renderValue(value, depth, collapsedDepth) {
  if (!isContainer(value)) return primitive(value);
  if (depth >= MAX_JSON_RENDER_DEPTH) return '<span class="jv-null">&hellip;</span>';

  const open = depth <= collapsedDepth ? ' open' : '';
  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((item, i) => [i, item, true])
    : Object.keys(value).map((key) => [key, value[key], false]);
  const children = entries
    .map(([key, item, isIndex]) =>
      `<div class="jv-row">${keyLabel(key, isIndex)}<span class="jv-punct">:</span> `
      + `${renderValue(item, depth + 1, collapsedDepth)}</div>`)
    .join('');

  return `<details class="jv-node"${open}><summary><span class="jv-punct">`
    + `${escapeHtml(countLabel(value))}</span></summary><div class="jv-children">${children}</div></details>`;
}

// `collapsedDepth` is absent => expand everything (a screenshot must show the
// full structure). A present value is clamped to the schema's ceiling; a
// non-number never reaches the renderer after validation but is treated as 0.
function normalizeCollapsedDepth(value) {
  if (value === undefined) return Number.POSITIVE_INFINITY;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_JSON_COLLAPSED_DEPTH);
}

export function renderJson(block) {
  const title = block.title ? `<div class="json-title">${escapeHtml(block.title)}</div>` : '';
  const tree = renderValue(block.data, 0, normalizeCollapsedDepth(block.collapsedDepth));
  return `<div class="blk">${title}<div class="json-tree">${tree}</div></div>`;
}
