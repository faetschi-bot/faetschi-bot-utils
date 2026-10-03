import { escapeAttr, escapeHtml, imageHref, renderMarkdown } from './html.mjs';

// Rendering for structural and reference blocks: file maps, images, diagrams,
// schemas, endpoints, prose, and simple data displays.

const FILE_BADGE = { added: 'A', removed: 'D', modified: 'M', renamed: 'R' };

export function renderFileTree(block) {
  const title = block.title ? `<div class="muted">${escapeHtml(block.title)}</div>` : '';
  const items = block.entries
    .map((entry) => {
      const change = FILE_BADGE[entry.change] ? entry.change : 'modified';
      const note = entry.note ? `<span class="note">${escapeHtml(entry.note)}</span>` : '';
      return `<li><span class="badge ${change}" title="${change}">${FILE_BADGE[change]}</span>`
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
  const href = imageHref(block.src, ctx.warnings);
  return `<div class="blk"><div class="img-single">${figure(href, block.alt, block.caption)}</div></div>`;
}

export function renderImagePair(block, ctx) {
  const before = imageHref(block.before, ctx.warnings);
  const after = imageHref(block.after, ctx.warnings);
  const caption = block.caption ? `<div class="muted">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="blk"><div class="img-pair">`
    + figure(before, block.captionBefore || 'Before', block.captionBefore || 'Before')
    + figure(after, block.captionAfter || 'After', block.captionAfter || 'After')
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

export function renderDataModel(block) {
  const entities = block.entities
    .map((entity) => {
      const fields = entity.fields
        .map((field) => {
          const key = field.pk ? 'PK' : field.fk ? 'FK' : '';
          const change = field.change ? `<span class="chg ${field.change}">${field.change}</span>` : '';
          const was = field.was ? `<span class="muted"> (was ${escapeHtml(String(field.was))})</span>` : '';
          return `<tr><td class="key">${key}</td><td>${escapeHtml(field.name)}${change}${was}</td>`
            + `<td class="type">${escapeHtml(field.type)}</td></tr>`;
        })
        .join('');
      return `<div class="entity"><div class="name">${escapeHtml(entity.name)}</div><table>${fields}</table></div>`;
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

export function renderTable(block) {
  const head = block.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const rows = (block.rows ?? [])
    .map((row) => `<tr>${(Array.isArray(row) ? row : [row]).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
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
