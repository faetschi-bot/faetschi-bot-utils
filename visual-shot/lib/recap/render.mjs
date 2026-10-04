import { DEFAULT_RECAP_WIDTH } from '../config.mjs';
import { renderAnnotatedCode, renderCode, renderDiff, renderPatch } from './blocks-code.mjs';
import {
  renderCallout,
  renderChecklist,
  renderDataModel,
  renderDiagram,
  renderEndpoint,
  renderFileTree,
  renderImage,
  renderImagePair,
  renderMermaid,
  renderNotes,
  renderTable,
} from './blocks-content.mjs';
import { renderJson } from './blocks-json.mjs';
import { renderWireframe } from './blocks-wireframe.mjs';
import { escapeHtml, renderMarkdown } from './html.mjs';
import { baseCss, DEFAULT_MAX_TABS, normalizeTheme } from './theme.mjs';

// Orchestration: dispatch each validated block to its renderer, assemble the
// document, and hand the command the info it needs for the browser pass
// (mermaid sources to render, warnings, and CSS to reuse for the final file).

// Appended only for the PNG screenshot pass: reveals every tab panel and swaps
// the interactive tab bar for per-panel headings, so one screenshot holds all
// tab content instead of just the first panel.
export const TABS_PRINT_CSS = `
.tabbar { display: none !important; }
.tab-panels > .panel { display: block !important; }
.tab-panels > .panel + .panel { margin-top: 14px; }
.tab-panels > .panel::before {
  content: attr(data-label);
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--muted);
  margin: 0 0 6px;
}
`.trim();

// Policy for the FINAL written artifact. CSS only: mermaid SVGs and highlight
// spans are already baked into the DOM by the browser pass, so the saved file
// needs no script execution.
export const RECAP_CSP = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:";

export function createRenderContext({ assetRoot, maxImageBytes } = {}) {
  let seq = 0;
  return {
    warnings: [],
    mermaid: [],
    assetRoot,
    maxImageBytes,
    nextId(prefix) {
      seq += 1;
      return `${prefix}-${seq}`;
    },
  };
}

// Deepest tab group anywhere in the block tree, counting nested columns/tabs.
function collectMaxTabs(blocks) {
  let max = 0;
  for (const block of blocks ?? []) {
    if (!block || typeof block !== 'object') continue;
    const children = block.type === 'tabs' ? block.tabs : block.type === 'columns' ? block.columns : null;
    if (!Array.isArray(children)) continue;
    if (block.type === 'tabs') max = Math.max(max, children.length);
    for (const child of children) {
      if (Array.isArray(child?.blocks)) max = Math.max(max, collectMaxTabs(child.blocks));
    }
  }
  return max;
}

function renderBlocks(blocks, ctx) {
  return blocks.map((block) => renderBlock(block, ctx)).join('\n');
}

function renderColumns(block, ctx) {
  const columns = block.columns
    .map((column) => {
      const label = column.label ? `<div class="col-label">${escapeHtml(column.label)}</div>` : '';
      return `<div class="col">${label}${renderBlocks(column.blocks, ctx)}</div>`;
    })
    .join('');
  const count = Math.max(1, block.columns.length);
  return `<div class="blk"><div class="columns" style="grid-template-columns:repeat(${count},minmax(0,1fr))">${columns}</div></div>`;
}

function renderTabs(block, ctx) {
  const group = ctx.nextId('tabs');
  const inputs = block.tabs
    .map((_, k) => `<input type="radio" name="${group}" id="${group}-${k}"${k === 0 ? ' checked' : ''}>`)
    .join('');
  const labels = block.tabs
    .map((tab, k) => `<label for="${group}-${k}">${escapeHtml(tab.label ?? `Tab ${k + 1}`)}</label>`)
    .join('');
  const panels = block.tabs
    .map((tab, k) => {
      const label = tab.label ?? `Tab ${k + 1}`;
      return `<div class="panel" data-label="${escapeHtml(label)}">${renderBlocks(tab.blocks, ctx)}</div>`;
    })
    .join('');
  return `<div class="blk"><div class="tabs">${inputs}<div class="tabbar">${labels}</div>`
    + `<div class="tab-panels">${panels}</div></div></div>`;
}

const RENDERERS = {
  'file-tree': renderFileTree,
  diff: renderDiff,
  patch: renderPatch,
  image: renderImage,
  'image-pair': renderImagePair,
  mermaid: renderMermaid,
  diagram: renderDiagram,
  wireframe: renderWireframe,
  'data-model': renderDataModel,
  'api-endpoint': renderEndpoint,
  callout: renderCallout,
  table: renderTable,
  checklist: renderChecklist,
  notes: renderNotes,
  code: renderCode,
  'annotated-code': renderAnnotatedCode,
  json: renderJson,
  columns: renderColumns,
  tabs: renderTabs,
};

export function renderBlock(block, ctx) {
  const renderer = RENDERERS[block.type];
  return renderer ? renderer(block, ctx) : '';
}

export function renderBody(recap, ctx) {
  const brief = recap.brief ? `<div class="brief">${renderMarkdown(recap.brief)}</div>` : '';
  const meta = recap.meta ? `<p class="meta-line">${escapeHtml(recap.meta)}</p>` : '';
  return `<h1>${escapeHtml(recap.title)}</h1>${brief}${meta}${renderBlocks(recap.blocks, ctx)}`;
}

export function recapCss({ highlightCss = '', width = DEFAULT_RECAP_WIDTH, maxTabs = DEFAULT_MAX_TABS } = {}) {
  return `${baseCss({ maxTabs })}\n#recap { width: ${width}px; }\n${highlightCss}`.trim();
}

// CSP is emitted verbatim except for the two characters that could break out of
// the double-quoted content attribute; single quotes stay readable and match the
// exported RECAP_CSP constant.
function escapeCsp(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function renderDocument({ bodyHtml, css, theme, width = DEFAULT_RECAP_WIDTH, title, csp }) {
  const cspMeta = typeof csp === 'string' && csp.length > 0
    ? `<meta http-equiv="Content-Security-Policy" content="${escapeCsp(csp)}">\n`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${cspMeta}<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body class="theme-${normalizeTheme(theme)}">
<div id="recap">
${bodyHtml}
</div>
</body>
</html>`;
}

// Builds the initial page. The command renders mermaid and runs highlight.js in
// the browser, then serializes #recap and rebuilds with the same css.
export function buildRecap(recap, { theme = 'light', width = DEFAULT_RECAP_WIDTH, extraCss = '', assetRoot, maxImageBytes } = {}) {
  const ctx = createRenderContext({ assetRoot, maxImageBytes });
  const body = renderBody(recap, ctx);
  const maxTabs = collectMaxTabs(recap.blocks);
  const css = recapCss({ highlightCss: extraCss, width, maxTabs });
  const html = renderDocument({ bodyHtml: body, css, theme, width, title: recap.title });
  return { html, css, body, mermaid: ctx.mermaid, warnings: ctx.warnings, theme: normalizeTheme(theme), maxTabs };
}
