// All recap styling lives here so block renderers emit structure only. Colors
// are CSS custom properties switched by a body class, so one stylesheet serves
// both themes and the screenshot pass without duplication.

export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

// highlight.js injects its own token classes; these tint them per theme so the
// vendored github/github-dark themes blend with the recap chrome.
const HIGHLIGHT_TINTS = `
  .hljs { background: transparent; padding: 0; }
`;

// Tab groups render as radio inputs + labels + panels, so the stylesheet needs
// one `:checked` rule per possible tab index. The real maximum is computed from
// the document at build time (see createRenderContext/buildRecap), so there is
// no fixed-low cap; the ceiling only guards against an absurd tab count turning
// into a giant stylesheet.
export const DEFAULT_MAX_TABS = 8;
const MAX_TAB_RULES = 512;

function clampTabCount(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_TAB_RULES);
}

export function tabRules(maxTabs = DEFAULT_MAX_TABS) {
  const count = clampTabCount(maxTabs);
  let css = '';
  for (let k = 1; k <= count; k++) {
    css += `.tabs > input:nth-of-type(${k}):checked ~ .tab-panels > .panel:nth-child(${k}) { display: block; }\n`;
    css += `.tabs > input:nth-of-type(${k}):checked ~ .tabbar > label:nth-child(${k}) { color: var(--fg); border-color: var(--accent); background: var(--card); }\n`;
  }
  return css;
}

export function baseCss({ maxTabs = DEFAULT_MAX_TABS } = {}) {
  return `
:root {
  --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0;
  --card: #f6f8fa; --accent: #0969da; --code-bg: #f6f8fa;
  --add-bg: #e6ffec; --add-fg: #1a7f37; --rem-bg: #ffebe9; --rem-fg: #cf222e;
  --pill-bg: #ddf4ff;
}
body.theme-dark {
  --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --border: #30363d;
  --card: #161b22; --accent: #4493f8; --code-bg: #161b22;
  --add-bg: #12261e; --add-fg: #3fb950; --rem-bg: #25171c; --rem-fg: #f85149;
  --pill-bg: #121d2f;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
body {
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
#recap { width: 1100px; max-width: 100%; margin: 0 auto; padding: 40px 44px 56px; }
h1 { font-size: 26px; line-height: 1.25; margin: 0 0 6px; }
h2 { font-size: 18px; margin: 30px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
h3 { font-size: 15px; margin: 22px 0 8px; }
p { margin: 8px 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
.blk { margin: 16px 0; }
.brief { color: var(--muted); font-size: 15px; margin: 0 0 8px; }
.meta-line { color: var(--muted); font-size: 12px; margin: 0 0 22px; }
.muted { color: var(--muted); }

/* file tree */
.file-tree { border: 1px solid var(--border); border-radius: 8px; background: var(--card); padding: 10px 12px; }
.file-tree ul { list-style: none; margin: 0; padding: 0; }
.file-tree li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.file-tree .path { color: var(--fg); }
.file-tree .note { color: var(--muted); font-size: 12px; }
.badge { display: inline-block; width: 18px; text-align: center; border-radius: 4px; font-size: 11px; font-weight: 700; padding: 1px 0; }
.badge.added { background: var(--add-bg); color: var(--add-fg); }
.badge.removed { background: var(--rem-bg); color: var(--rem-fg); }
.badge.modified { background: var(--pill-bg); color: var(--accent); }
.badge.renamed { background: var(--card); color: var(--muted); border: 1px solid var(--border); }

/* diff */
.diff { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.diff-head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--card); border-bottom: 1px solid var(--border); font-size: 12px; }
.diff-head .file { font-weight: 600; }
.diff-grid { display: grid; grid-template-columns: 1fr 1fr; }
.diff-col { min-width: 0; overflow: auto; }
.diff-col + .diff-col { border-left: 1px solid var(--border); }
.diff-col .col-title { padding: 4px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); background: var(--card); }
.line { display: flex; white-space: pre; }
.line .ln { flex: 0 0 42px; text-align: right; padding: 0 8px 0 6px; color: var(--muted); user-select: none; border-right: 1px solid var(--border); }
.line .code { flex: 1; padding: 0 10px; white-space: pre; }
.line.add, .line.add .code { background: var(--add-bg); }
.line.rem, .line.rem .code { background: var(--rem-bg); }
.line.empty { background: var(--card); }
.mark { color: var(--accent); font-weight: 700; }
.annot { margin: 10px 0 0; padding: 0; list-style: none; font-size: 13px; }
.annot li { padding: 6px 10px; border-left: 3px solid var(--accent); background: var(--card); margin: 4px 0; border-radius: 0 6px 6px 0; }
.annot .tag { font-weight: 700; }
.patch { margin: 0; background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; overflow: auto; }
.patch .line .ln { display: none; }
.patch.numbered .line .ln { display: block; }
.code-block { margin: 0; background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; font-size: 13px; }
.code-block code { white-space: pre; }

/* images */
.img-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.img-pair figure, .img-single figure { margin: 0; }
.img-pair figcaption, .img-single figcaption { font-size: 12px; color: var(--muted); margin-top: 6px; }
.img-pair img, .img-single img { width: 100%; border: 1px solid var(--border); border-radius: 8px; display: block; }
.img-missing { padding: 24px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 8px; }

/* mermaid / diagram */
.mermaid-slot { display: flex; justify-content: center; padding: 10px; overflow: auto; }
.mermaid-slot svg { max-width: 100%; height: auto; }
.diagram-frame { border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; }

/* wireframe: author HTML/CSS renders inside a sandboxed srcdoc iframe
   (.wf-body) so it cannot restyle the report; the frame chrome stays CSS-only. */
.wf { max-width: 100%; }
.wf-frame { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--bg); }
.wf-bar { background: var(--card); border-bottom: 1px solid var(--border); }
.wf-body { display: block; width: 100%; border: 0; background: #fff; }
.wf-caption { font-size: 12px; margin-top: 6px; }
/* Surface widths; JS only picks the class, never sets a width. */
.wf-browser, .wf-desktop { width: 100%; }
.wf-tablet, .wf-mobile, .wf-popover, .wf-panel { margin-left: auto; margin-right: auto; }
.wf-tablet { width: 768px; }
.wf-mobile { width: 375px; }
.wf-popover { width: 360px; }
.wf-panel { width: 420px; }
/* CSS-only chrome per surface. */
.wf-browser .wf-bar { height: 28px; }
.wf-browser .wf-bar::before {
  content: "";
  display: block;
  width: 9px; height: 9px;
  margin: 9px 0 0 12px;
  border-radius: 50%;
  background: var(--rem-fg);
  box-shadow: 16px 0 0 var(--muted), 32px 0 0 var(--add-fg);
}
.wf-desktop .wf-bar { height: 26px; }
.wf-desktop .wf-bar::before {
  content: "";
  display: block;
  width: 40%; height: 8px;
  margin: 9px 12px 0;
  border-radius: 4px;
  background: var(--border);
}
.wf-tablet .wf-bar { height: 18px; }
.wf-tablet .wf-bar::before {
  content: "";
  display: block;
  width: 6px; height: 6px;
  margin: 5px auto 0;
  border-radius: 50%;
  background: var(--border);
}
.wf-mobile .wf-bar { height: 22px; }
.wf-mobile .wf-bar::before {
  content: "";
  display: block;
  width: 90px; height: 8px;
  margin: 6px auto 0;
  border-radius: 6px;
  background: var(--border);
}
.wf-popover .wf-bar { height: 16px; }
.wf-popover .wf-bar::before {
  content: "";
  display: block;
  width: 40px; height: 4px;
  margin: 6px auto 0;
  border-radius: 3px;
  background: var(--border);
}
.wf-panel .wf-bar { height: 26px; }
.wf-panel .wf-bar::before {
  content: "";
  display: block;
  width: 55%; height: 8px;
  margin: 9px 12px 0;
  border-radius: 4px;
  background: var(--border);
}

/* data model */
.data-model { display: flex; flex-wrap: wrap; gap: 14px; }
.entity { border: 1px solid var(--border); border-radius: 8px; min-width: 240px; background: var(--card); overflow: hidden; }
.entity > .name { padding: 8px 12px; font-weight: 700; background: var(--pill-bg); border-bottom: 1px solid var(--border); }
.entity table { border-collapse: collapse; width: 100%; font-size: 13px; }
.entity td { padding: 4px 12px; border-top: 1px solid var(--border); }
.entity td.key { color: var(--muted); width: 44px; }
.entity td.type { color: var(--muted); }
.chg { font-size: 11px; font-weight: 700; padding: 0 5px; border-radius: 4px; margin-left: 6px; }
.chg.added { background: var(--add-bg); color: var(--add-fg); }
.chg.removed { background: var(--rem-bg); color: var(--rem-fg); }
.chg.modified, .chg.renamed { background: var(--pill-bg); color: var(--accent); }

/* endpoint */
.endpoint { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.endpoint .head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--card); }
.method { font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--pill-bg); color: var(--accent); }
.endpoint .body { padding: 10px 12px; }
.endpoint table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 8px; }
.endpoint th, .endpoint td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--border); }
/* A removed endpoint is outlined red and its path struck through. */
.endpoint.removed { border-color: var(--rem-fg); }
.endpoint.removed .head { background: var(--rem-bg); }
.endpoint.removed code { text-decoration: line-through; }

/* json explorer */
.json-title { font-weight: 700; margin-bottom: 6px; }
.json-tree {
  border: 1px solid var(--border); border-radius: 8px; background: var(--card);
  padding: 10px 12px; overflow: auto; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
.jv-node > summary { cursor: pointer; list-style: none; }
.jv-node > summary::-webkit-details-marker { display: none; }
.jv-node > summary::before { content: "\\25B8"; display: inline-block; width: 12px; color: var(--muted); }
.jv-node[open] > summary::before { content: "\\25BE"; }
.jv-children { margin-left: 14px; padding-left: 10px; border-left: 1px solid var(--border); }
.jv-row { padding: 1px 0; }
.jv-key { color: var(--muted); }
.jv-index { color: var(--muted); }
.jv-punct { color: var(--muted); }
.jv-string { color: var(--add-fg); }
.jv-number { color: var(--accent); }
.jv-bool { color: var(--rem-fg); }
.jv-null { color: var(--muted); font-style: italic; }

/* callout */
.callout { border-left: 4px solid var(--accent); background: var(--card); padding: 10px 14px; border-radius: 0 8px 8px 0; }
.callout.risk, .callout.warning { border-left-color: var(--rem-fg); }
.callout.success, .callout.decision { border-left-color: var(--add-fg); }
.callout .title { font-weight: 700; margin-bottom: 2px; }

/* table */
table.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
table.grid th, table.grid td { text-align: left; padding: 7px 10px; border: 1px solid var(--border); }
table.grid th { background: var(--card); }

/* checklist */
.checklist { list-style: none; margin: 0; padding: 0; }
.checklist li { padding: 4px 0 4px 26px; position: relative; }
.checklist li::before { content: "\\2610"; position: absolute; left: 4px; color: var(--muted); }
.checklist li.done::before { content: "\\2611"; color: var(--add-fg); }
.checklist .note { color: var(--muted); font-size: 12px; display: block; }

/* columns + tabs */
.columns { display: grid; gap: 14px; align-items: start; }
.columns .col-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 6px; }
.tabs { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.tabs > input { display: none; }
.tabbar { display: flex; flex-wrap: wrap; gap: 2px; background: var(--card); border-bottom: 1px solid var(--border); padding: 4px 6px 0; }
.tabbar label { padding: 6px 10px; font-size: 12px; color: var(--muted); cursor: pointer; border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; }
.tab-panels { padding: 12px; }
.tab-panels > .panel { display: none; }
${tabRules(maxTabs)}
${HIGHLIGHT_TINTS}
`.trim();
}
