import { computeLineDiff } from './diff.mjs';
import { cellText } from './html.mjs';

// GitHub-flavoured Markdown output for a validated recap. GitHub renders
// Mermaid fences, <details>, tables, and images natively, so a GFM comment is a
// better PR artifact than a screenshot for everything except the two blocks that
// need live HTML (diagram/wireframe). The output is deterministic — no
// timestamps — so a workflow can diff or upsert it as a sticky comment.
//
// Trust model: the recap JSON is untrusted. Prose and inline fields are run
// through escapeProse, which neutralises HTML tags (`<`/`>`) while leaving
// Markdown intact, so a field can style text but cannot inject an element. The
// only content passed through literally is inside fenced code blocks; the sole
// structural tags the renderer emits itself are <details>, <summary>, and <br>.

// Marker a workflow matches on to update its own comment in place instead of
// posting a new one each run.
export const RECAP_GFM_MARKER = '<!-- visual-shot-recap -->';

// Letter shown in the file-tree badge column.
const FILE_BADGE = { added: 'A', removed: 'D', modified: 'M', renamed: 'R' };

// Neutralise HTML in prose/inline text while keeping Markdown constructs
// (`code`, **bold**, links) intact. `&` is deliberately left untouched so an
// existing entity such as `&amp;` is not double-decoded by the renderer.
export function escapeProse(value) {
  return String(value ?? '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// A table cell: no raw pipe (breaks the column) and no raw newline (ends the
// row). Newlines become the only tag we add besides details/summary.
export function escapeCell(value) {
  return escapeProse(value)
    .replace(/\|/g, '\\|')
    .replace(/\r\n?|\n/g, '<br>');
}

// Collapse a one-line field (heading, caption, meta) to a single line so a
// stray newline cannot break the line it is interpolated into.
function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// A Markdown link/image destination, enclosed in angle brackets so `)`, spaces,
// and parentheses inside it cannot break out of the link. Newlines and control
// characters are stripped, and `<`/`>` are percent-encoded so they cannot close
// the brackets.
function linkDestination(url) {
  return `<${String(url ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')}>`;
}

// Image/link label text: one line, HTML-neutralised, and with the characters
// that could close the `![...]` label or start a nested construct escaped.
function imageAlt(value) {
  return escapeProse(oneLine(value))
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

// Pick a fence delimiter longer than any backtick run in the content, so code
// containing ``` cannot terminate the block early. Minimum length is three.
export function fenceFor(content, language = '') {
  const text = String(content ?? '').replace(/\n$/, '');
  const runs = text.match(/`+/g);
  const length = runs ? Math.max(3, ...runs.map((run) => run.length + 1)) : 3;
  const fence = '`'.repeat(length);
  return `${fence}${language}\n${text}\n${fence}`;
}

// Inline code with a delimiter longer than any backtick in the span.
function inlineCode(text) {
  const value = String(text ?? '');
  const runs = value.match(/`+/g);
  const length = runs ? Math.max(...runs.map((run) => run.length)) + 1 : 1;
  const tick = '`'.repeat(length);
  return `${tick}${value}${tick}`;
}

// Structural <details> wrapper. The summary is untrusted, so it is escaped and
// collapsed to one line.
function details(summary, body) {
  return `<details>\n<summary>${oneLine(escapeProse(summary))}</summary>\n\n${body}\n\n</details>`;
}

// "PK" / "FK → users.id" / "FK" / "". Uses a literal arrow rather than the HTML
// entity so it renders in a comment.
function fieldKeys(field) {
  if (field.pk) return 'PK';
  if (typeof field.fk === 'string' && field.fk) return `FK → ${field.fk}`;
  if (field.fk) return 'FK';
  return '';
}

// Diff-aware suffix for endpoint params/responses: a change badge and the
// previous name/status as `(was …)`.
function endpointChangeText(entry) {
  const parts = [];
  if (entry.change) parts.push(entry.change);
  if (entry.was !== undefined && entry.was !== null && entry.was !== '') {
    parts.push(`(was ${entry.was})`);
  }
  return parts.join(' ');
}

// Annotation bullets shared by diff, code, and annotated-code blocks. Mirrors
// the HTML annotation list: optional tag, line reference, then the note.
function annotationList(annotations) {
  if (!Array.isArray(annotations) || annotations.length === 0) return '';
  return annotations
    .map((annotation) => {
      const label = annotation?.label ? `**${escapeProse(annotation.label)}** ` : '';
      const where = annotation?.lines
        ? `Line ${escapeProse(annotation.lines)}${annotation.side === 'before' ? ' (before)' : ''}: `
        : '';
      return `- ${label}${where}${escapeProse(annotation?.note ?? '')}`;
    })
    .join('\n');
}

// Unified diff text built from the shared line differ. `+`/`-`/space prefixes
// only; GitHub's diff fence colors them without needing hunk headers.
function unifiedDiffText(block) {
  const { unified } = computeLineDiff(block.before, block.after);
  return unified
    .map((line) => {
      const sign = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
      return `${sign}${line.text}`;
    })
    .join('\n');
}

function renderNotes(block) {
  const title = block.title ? `### ${oneLine(escapeProse(block.title))}` : '';
  const body = escapeProse(block.markdown ?? '');
  return [title, body].filter((part) => part.length > 0).join('\n\n');
}

// A blockquote. Tone/title get their own quoted lines; a bare `>` separates the
// header from the body so they do not collapse into one paragraph.
function renderCallout(block) {
  const lines = [];
  if (block.tone) lines.push(`> _${oneLine(escapeProse(block.tone))}_`);
  if (block.title) lines.push(`> **${oneLine(escapeProse(block.title))}**`);
  if (lines.length > 0) lines.push('>');
  for (const line of escapeProse(block.body ?? '').split('\n')) {
    lines.push(line.length > 0 ? `> ${line}` : '>');
  }
  return lines.join('\n');
}

function renderFileTree(block) {
  const title = block.title ? `**${oneLine(escapeProse(block.title))}**\n\n` : '';
  const header = '| | File | Note |\n| --- | --- | --- |';
  const rows = block.entries.map((entry) => {
    const change = Object.hasOwn(FILE_BADGE, entry.change) ? entry.change : 'modified';
    return `| ${FILE_BADGE[change]} | ${escapeCell(entry.path)} | ${escapeCell(entry.note ?? '')} |`;
  });
  return title + [header, ...rows].join('\n');
}

function renderDiff(block) {
  const label = block.filename || 'diff';
  const summary = block.summary ? `${label} — ${block.summary}` : label;
  const body = [fenceFor(unifiedDiffText(block), 'diff'), annotationList(block.annotations)]
    .filter((part) => part.length > 0)
    .join('\n\n');
  return details(summary, body);
}

function renderPatch(block) {
  const patch = String(block.patch ?? '');
  const body = patch.trim().length > 0 ? fenceFor(patch, 'diff') : '_No textual changes._';
  return details(block.filename || 'patch', body);
}

function renderCodeLike(block, defaultLabel) {
  const caption = block.caption ? `_${escapeProse(block.caption)}_` : '';
  const body = [fenceFor(block.code ?? '', block.language || ''), caption, annotationList(block.annotations)]
    .filter((part) => part.length > 0)
    .join('\n\n');
  return details(block.filename || defaultLabel, body);
}

function renderMermaid(block) {
  const fence = fenceFor(block.source ?? '', 'mermaid');
  const caption = block.caption ? `_${escapeProse(block.caption)}_` : '';
  return [fence, caption].filter((part) => part.length > 0).join('\n\n');
}

function renderJson(block) {
  let data;
  try {
    data = JSON.stringify(block.data, null, 2);
  } catch {
    data = String(block.data);
  }
  if (data === undefined) data = String(block.data);
  return details(block.title || 'JSON', fenceFor(data, 'json'));
}

function renderTable(block) {
  const columns = block.columns ?? [];
  const header = `| ${columns.map((column) => escapeCell(cellText(column))).join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const rows = (block.rows ?? []).map((row) => {
    const cells = Array.isArray(row) ? row : [row];
    return `| ${cells.map((cell) => escapeCell(cellText(cell))).join(' | ')} |`;
  });
  return [header, separator, ...rows].join('\n');
}

function renderChecklist(block) {
  return block.items
    .map((item) => {
      const box = item.checked ? 'x' : ' ';
      const note = item.note ? ` — ${escapeProse(item.note)}` : '';
      return `- [${box}] ${escapeProse(item.label)}${note}`;
    })
    .join('\n');
}

function renderDataModel(block) {
  const entities = (block.entities ?? []).map((entity) => {
    const name = entity.change
      ? `${escapeProse(entity.name)} _(${escapeProse(entity.change)})_`
      : escapeProse(entity.name);
    const header = '| Field | Type | Keys | Change |\n| --- | --- | --- | --- |';
    const rows = entity.fields.map((field) => {
      let label = String(field.name ?? '');
      if (field.was !== undefined && field.was !== null && field.was !== '') {
        label += ` (was ${field.was})`;
      }
      if (field.note) label += ` — ${field.note}`;
      return `| ${escapeCell(label)} | ${escapeCell(field.type)} | ${escapeCell(fieldKeys(field))} | ${escapeCell(field.change ?? '')} |`;
    });
    return `### ${oneLine(name)}\n\n${[header, ...rows].join('\n')}`;
  });
  const relations = block.relations?.length
    ? `_Relations: ${block.relations
        .map((relation) => `${escapeProse(relation.from)} → ${escapeProse(relation.to)}${relation.kind ? ` (${escapeProse(relation.kind)})` : ''}`)
        .join(', ')}_`
    : '';
  return [...entities, relations].filter((part) => part.length > 0).join('\n\n');
}

function renderEndpoint(block) {
  const heading = `### ${inlineCode(oneLine(`${block.method} ${block.path}`))}`;
  const description = block.description ? escapeProse(block.description) : '';
  const params = block.params ?? [];
  const responses = block.responses ?? [];

  const paramsTable = params.length > 0
    ? [
        '| Name | In | Type | Required | Change/Notes |',
        '| --- | --- | --- | --- | --- |',
        ...params.map((param) => {
          const change = endpointChangeText(param);
          const notes = [change, param.description].filter(Boolean).join(' — ');
          return `| ${escapeCell(param.name ?? '')} | ${escapeCell(param.in ?? '')} | ${escapeCell(param.type ?? '')} | ${param.required ? 'yes' : ''} | ${escapeCell(notes)} |`;
        }),
      ].join('\n')
    : '';

  const responsesTable = responses.length > 0
    ? [
        '| Status | Description | Example | Change |',
        '| --- | --- | --- | --- |',
        ...responses.map((response) =>
          `| ${escapeCell(String(response.status ?? ''))} | ${escapeCell(response.description ?? '')} | ${escapeCell(response.example ?? '')} | ${escapeCell(endpointChangeText(response))} |`),
      ].join('\n')
    : '';

  return [heading, description, paramsTable, responsesTable]
    .filter((part) => part.length > 0)
    .join('\n\n');
}

function renderImage(block) {
  const image = `![${imageAlt(block.alt ?? '')}](${linkDestination(block.src)})`;
  const caption = block.caption ? `_${escapeProse(block.caption)}_` : '';
  return [image, caption].filter((part) => part.length > 0).join('\n\n');
}

function renderImagePair(block) {
  const table = [
    '| Before | After |',
    '| --- | --- |',
    `| ![before](${linkDestination(block.before)}) | ![after](${linkDestination(block.after)}) |`,
  ].join('\n');
  const caption = block.caption ? `_${escapeProse(block.caption)}_` : '';
  return [table, caption].filter((part) => part.length > 0).join('\n\n');
}

// diagram/wireframe bodies are live HTML and cannot render in a comment, so
// emit a placeholder that names the caption and points at the report instead.
function renderPlaceholder(kind, block, options) {
  const caption = block.caption ? ` “${oneLine(escapeProse(block.caption))}”` : '';
  const target = options.reportUrl ? `[rendered report](${linkDestination(options.reportUrl)})` : 'rendered report';
  return `_Interactive ${kind}${caption} — see the ${target}._`;
}

function renderColumns(block, options) {
  return block.columns
    .map((column) => {
      const label = column.label ? `**${oneLine(escapeProse(column.label))}**` : '';
      const body = renderBlocks(column.blocks, options);
      return [label, body].filter((part) => part.length > 0).join('\n\n');
    })
    .join('\n\n');
}

// Tabs are flattened like the PNG pass: every panel's blocks follow its label.
function renderTabs(block, options) {
  return block.tabs
    .map((tab, index) => {
      const label = `**${oneLine(escapeProse(tab.label ?? `Tab ${index + 1}`))}**`;
      const body = renderBlocks(tab.blocks, options);
      return [label, body].filter((part) => part.length > 0).join('\n\n');
    })
    .join('\n\n');
}

const RENDERERS = {
  notes: renderNotes,
  callout: renderCallout,
  'file-tree': renderFileTree,
  diff: renderDiff,
  patch: renderPatch,
  code: (block) => renderCodeLike(block, 'code'),
  'annotated-code': (block) => renderCodeLike(block, 'annotated code'),
  mermaid: renderMermaid,
  json: renderJson,
  table: renderTable,
  checklist: renderChecklist,
  'data-model': renderDataModel,
  'api-endpoint': renderEndpoint,
  image: renderImage,
  'image-pair': renderImagePair,
  columns: renderColumns,
  tabs: renderTabs,
  diagram: (block, options) => renderPlaceholder('diagram', block, options),
  wireframe: (block, options) => renderPlaceholder('wireframe', block, options),
};

function renderBlock(block, options) {
  const renderer = RENDERERS[block?.type];
  return renderer ? renderer(block, options) : '';
}

function renderBlocks(blocks, options) {
  return (blocks ?? [])
    .map((block) => renderBlock(block, options))
    .filter((part) => part.length > 0)
    .join('\n\n');
}

// Render a validated recap as a GitHub comment. `reportUrl` points at the
// rendered HTML report and `imageUrl` at a PNG of it; both are optional and are
// emitted near the top when present.
export function renderRecapGfm(recap, options = {}) {
  const { reportUrl, imageUrl } = options;
  const parts = [RECAP_GFM_MARKER, `# ${escapeProse(oneLine(recap.title))}`];
  if (recap.brief) parts.push(escapeProse(recap.brief));
  if (recap.meta) parts.push(`_${oneLine(escapeProse(recap.meta))}_`);
  if (reportUrl) parts.push(`[Open the interactive recap](${linkDestination(reportUrl)})`);
  if (imageUrl) parts.push(`![Visual recap](${linkDestination(imageUrl)})`);
  const body = renderBlocks(recap.blocks, { reportUrl, imageUrl });
  if (body) parts.push(body);
  return `${parts.join('\n\n')}\n`;
}
