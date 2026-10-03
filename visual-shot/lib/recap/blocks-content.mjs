import { escapeAttr, escapeHtml, imageHref, renderMarkdown } from './html.mjs';
import { CHANGE_VALUES } from './schema.mjs';

// Rendering for structural and reference blocks: file maps, images, diagrams,
// schemas, endpoints, prose, and simple data displays.

const FILE_BADGE = { added: 'A', removed: 'D', modified: 'M', renamed: 'R' };

function changeBadge(change) {
  if (!CHANGE_VALUES.has(change)) return '';
  return `<span class="chg ${escapeAttr(change)}">${escapeHtml(change)}</span>`;
}

export function renderFileTree(block) {
  const title = block.title ? `<div class="muted">${escapeHtml(block.title)}</div>` : '';
  const items = block.entries
    .map((entry) => {
      // Own-property lookup: `__proto__`/`constructor` must not resolve to an
      // inherited value, and only a known change gets badge styling.
      const change = Object.hasOwn(FILE_BADGE, entry.change) ? entry.change : 'modified';
      const note = entry.note ? `<span class="note">${escapeHtml(entry.note)}</span>` : '';
      return `<li><span class="badge ${escapeAttr(change)}" title="${escapeAttr(change)}">${escapeHtml(FILE_BADGE[change])}</span>`
        + `<span class="path">${escapeHtml(entry.path)}</span>${note}</li>`;
    })
    .join('');
  return `<div class="blk"><div class="file-tree">${title}<ul>${items}</ul></div></div>`;
}

function figure(href, alt, caption) {
  const img = href
    ? `<img src="${escapeAttr(href)}" alt="${escapeAttr(alt)}">`
    : `<div class="img-missing">image not found</div>`;
  const cap = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
  return `<figure>${img}${cap}</figure>`;
}

export function renderImage(block, ctx) {
  const href = imageHref(block.src, ctx);
  return `<div class="blk"><div class="img-single">${figure(href, block.alt ?? '', block.caption)}</div></div>`;
}

export function renderImagePair(block, ctx) {
  const before = imageHref(block.before, ctx);
  const after = imageHref(block.after, ctx);
  const caption = block.caption ? `<div class="muted">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="blk"><div class="img-pair">`
    + figure(before, '', block.captionBefore)
    + figure(after, '', block.captionAfter)
    + `</div>${caption}</div>`;
}

export function renderMermaid(block, ctx) {
  const id = ctx.nextId('mermaid');
  ctx.mermaid.push({ id, source: block.source });
  const caption = block.caption ? `<div class="muted">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="blk"><div class="mermaid-slot" data-mermaid-id="${id}"></div>${caption}</div>`;
}

export function renderDiagram(block) {
  const style = block.css ? `<style>${block.css}</style>` : '';
  const caption = block.caption ? `<div class="muted">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="blk">${style}<div class="diagram-frame">${block.html}</div>${caption}</div>`;
}

function dataModelKey(field) {
  if (field.pk) return 'PK';
  if (typeof field.fk === 'string' && field.fk) return `FK &rarr; ${escapeHtml(field.fk)}`;
  if (field.fk) return 'FK';
  return '';
}

export function renderDataModel(block) {
  const entities = block.entities
    .map((entity) => {
      const fields = entity.fields
        .map((field) => {
          const key = dataModelKey(field);
          const change = changeBadge(field.change);
          const was = field.was ? `<span class="muted"> (was ${escapeHtml(String(field.was))})</span>` : '';
          const note = field.note ? `<span class="muted"> ${escapeHtml(field.note)}</span>` : '';
          return `<tr><td class="key">${key}</td><td>${escapeHtml(field.name)}${change}${was}${note}</td>`
            + `<td class="type">${escapeHtml(field.type)}</td></tr>`;
        })
        .join('');
      return `<div class="entity"><div class="name">${escapeHtml(entity.name)}${changeBadge(entity.change)}</div><table>${fields}</table></div>`;
    })
    .join('');
  const relations = block.relations?.length
    ? `<div class="muted">Relations: ${block.relations.map((r) => `${escapeHtml(r.from)} &rarr; ${escapeHtml(r.to)}${r.kind ? ` (${escapeHtml(r.kind)})` : ''}`).join(', ')}</div>`
    : '';
  return `<div class="blk"><div class="data-model">${entities}</div>${relations}</div>`;
}

function endpointTable(headers, rows) {
  if (rows.length === 0) return '';
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = rows.map((cols) => `<tr>${cols.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderEndpoint(block) {
  const summary = block.summary ? `<span class="muted">${escapeHtml(block.summary)}</span>` : '';
  const deprecated = block.deprecated ? '<span class="method">deprecated</span>' : '';
  const description = block.description ? `<p>${escapeHtml(block.description)}</p>` : '';
  const params = endpointTable(
    ['Name', 'In', 'Type', 'Required', 'Notes'],
    (block.params ?? []).map((p) => [
      p.name ?? '',
      p.in ?? '',
      p.type ?? '',
      p.required ? 'yes' : '',
      p.description ?? '',
    ]),
  );
  const responses = endpointTable(
    ['Status', 'Description', 'Example'],
    (block.responses ?? []).map((r) => [String(r.status ?? ''), r.description ?? '', r.example ?? '']),
  );
  return `<div class="blk"><div class="endpoint"><div class="head">`
    + `<span class="method">${escapeHtml(block.method)}</span><code>${escapeHtml(block.path)}</code>${deprecated}${summary}`
    + `</div><div class="body">${description}${params}${responses}</div></div></div>`;
}

export function renderCallout(block) {
  const tone = ['info', 'decision', 'risk', 'warning', 'success'].includes(block.tone) ? block.tone : 'info';
  const title = block.title ? `<div class="title">${escapeHtml(block.title)}</div>` : '';
  return `<div class="blk"><div class="callout ${tone}">${title}${renderMarkdown(block.body)}</div></div>`;
}

// Table cells are untrusted and may be any JSON value. Render text as-is,
// null/undefined as empty, and structured values as JSON so a cell never
// collapses to "[object Object]".
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

export function renderTable(block) {
  const head = block.columns.map((c) => `<th>${escapeHtml(cellText(c))}</th>`).join('');
  const rows = (block.rows ?? [])
    .map((row) => `<tr>${(Array.isArray(row) ? row : [row]).map((c) => `<td>${escapeHtml(cellText(c))}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="blk"><table class="grid"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderChecklist(block) {
  const items = block.items
    .map((item) => {
      const note = item.note ? `<span class="note">${escapeHtml(item.note)}</span>` : '';
      return `<li class="${item.checked ? 'done' : ''}">${escapeHtml(item.label)}${note}</li>`;
    })
    .join('');
  return `<div class="blk"><ul class="checklist">${items}</ul></div>`;
}

export function renderNotes(block) {
  const title = block.title ? `<h3>${escapeHtml(block.title)}</h3>` : '';
  return `<div class="blk">${title}${renderMarkdown(block.markdown)}</div>`;
}
