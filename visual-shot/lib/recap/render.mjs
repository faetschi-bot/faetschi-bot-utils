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
import { escapeHtml, renderMarkdown } from './html.mjs';
import { baseCss, normalizeTheme } from './theme.mjs';

// Orchestration: dispatch each validated block to its renderer, assemble the
// document, and hand the command the info it needs for the browser pass
// (mermaid sources to render, warnings, and CSS to reuse for the final file).

export function createRenderContext() {
  let seq = 0;
  return {
    warnings: [],
    mermaid: [],
    nextId(prefix) {
      seq += 1;
      return `${prefix}-${seq}`;
    },
  };
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
  const count = Math.max(1, Math.min(block.columns.length, 3));
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
    .map((tab) => `<div class="panel">${renderBlocks(tab.blocks, ctx)}</div>`)
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
  'data-model': renderDataModel,
  'api-endpoint': renderEndpoint,
  callout: renderCallout,
  table: renderTable,
  checklist: renderChecklist,
  notes: renderNotes,
  code: renderCode,
  'annotated-code': renderAnnotatedCode,
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

export function recapCss({ highlightCss = '', width = DEFAULT_RECAP_WIDTH } = {}) {
  return `${baseCss()}\n#recap { width: ${width}px; }\n${highlightCss}`.trim();
}

export function renderDocument({ bodyHtml, css, theme, width = DEFAULT_RECAP_WIDTH, title }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
export function buildRecap(recap, { theme = 'light', width = DEFAULT_RECAP_WIDTH, extraCss = '' } = {}) {
  const ctx = createRenderContext();
  const body = renderBody(recap, ctx);
  const css = recapCss({ highlightCss: extraCss, width });
  const html = renderDocument({ bodyHtml: body, css, theme, width, title: recap.title });
  return { html, css, body, mermaid: ctx.mermaid, warnings: ctx.warnings, theme: normalizeTheme(theme) };
}
