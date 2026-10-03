import { escapeAttr, escapeHtml } from './html.mjs';
import { MAX_WIREFRAME_HEIGHT, WIREFRAME_DEFAULT_HEIGHTS, WIREFRAME_SURFACES } from './schema.mjs';

// Rendering for the wireframe block: a framed UI mockup whose body is raw
// trusted author HTML. Unlike `diagram`, the body is wrapped in a `sandbox`
// iframe and delivered through `srcdoc`, so author CSS stays scoped to that one
// mockup and can never restyle the report or a sibling wireframe. The empty
// `sandbox` also disables scripts in both the render pass and the saved
// artifact — a wireframe is a static mockup, not an interactive surface.
// `html`/`css` are still trusted author content: never interpolate diff text
// into them. Before/after is composed by placing two wireframes inside a
// `columns` block; there is no separate pairing type. Everything outside the
// raw author fields (caption, id, height) is escaped or validated.
//
// `html`/`css` are embedded verbatim inside the srcdoc document, which is then
// attribute-escaped for the `srcdoc` value. The document therefore cannot break
// out of the attribute; the `sandbox` prevents any script that survives from
// executing.

// Base CSS injected inside each iframe so a mockup is readable regardless of the
// report theme. Author `css` is appended after it, so it can override these.
export const WIREFRAME_BASE_CSS =
  'html,body{margin:0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;background:#fff;color:#1f2328}'
  + '*,*::before,*::after{box-sizing:border-box}';

function wireframeHeight(block, surface) {
  const h = block.height;
  if (Number.isInteger(h) && h > 0 && h <= MAX_WIREFRAME_HEIGHT) return h;
  return WIREFRAME_DEFAULT_HEIGHTS[surface] ?? WIREFRAME_DEFAULT_HEIGHTS.browser;
}

export function renderWireframe(block, ctx) {
  const surface = WIREFRAME_SURFACES.has(block.surface) ? block.surface : 'browser';
  const height = wireframeHeight(block, surface);
  const id = block.id ? ` id="${escapeAttr(block.id)}"` : '';
  const caption = block.caption ? `<div class="muted wf-caption">${escapeHtml(block.caption)}</div>` : '';
  const css = typeof block.css === 'string' ? block.css : '';
  const body = typeof block.html === 'string' ? block.html : '';
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${WIREFRAME_BASE_CSS}${css}</style></head><body>${body}</body></html>`;
  return `<div class="blk"><div class="wf wf-${surface}"${id}>`
    + `<div class="wf-frame"><div class="wf-bar"></div>`
    + `<iframe class="wf-body" sandbox srcdoc="${escapeAttr(doc)}" style="height:${height}px"></iframe>`
    + `</div>${caption}</div></div>`;
}
