import { classifyPatchLine, computeLineDiff, parseLineRange, splitLines } from './diff.mjs';
import { codeClass, escapeHtml } from './html.mjs';

// Rendering for everything that shows code or a literal change: full-file
// before/after diffs, raw unified patches, code snippets, and annotated code.

function annotationLines(block, side) {
  const set = new Set();
  for (const a of block.annotations ?? []) {
    const aSide = a?.side === 'before' ? 'left' : 'right';
    if (aSide !== side) continue;
    for (const n of parseLineRange(a?.lines)) set.add(n);
  }
  return set;
}

function renderAnnotations(annotations) {
  if (!Array.isArray(annotations) || annotations.length === 0) return '';
  const items = annotations
    .map((a) => {
      const label = a?.label ? `<span class="tag">${escapeHtml(a.label)}</span> ` : '';
      const where = a?.lines
        ? `<span class="muted">Line ${escapeHtml(String(a.lines))}${a.side === 'before' ? ' (before)' : ''}: </span>`
        : '';
      return `<li>${label}${where}${escapeHtml(a?.note ?? '')}</li>`;
    })
    .join('');
  return `<ul class="annot">${items}</ul>`;
}

function renderSplit(rows, language, beforeSet, afterSet) {
  const cls = codeClass(language);
  const cell = (r, set, kind) => {
    if (!r) return '<div class="line empty"><span class="ln"></span><span class="code"></span></div>';
    const text = r.text === '' ? '&nbsp;' : escapeHtml(r.text);
    const inner = cls ? `<code${cls}>${text}</code>` : text;
    const mark = set.has(r.n) ? '<span class="mark">&#9679;</span>' : '';
    return `<div class="line ${kind}"><span class="ln">${r.n}</span><span class="code">${mark}${inner}</span></div>`;
  };
  const left = rows
    .map((r) => cell(r.left, beforeSet, r.kind === 'removed' || r.kind === 'changed' ? 'rem' : ''))
    .join('');
  const right = rows
    .map((r) => cell(r.right, afterSet, r.kind === 'added' || r.kind === 'changed' ? 'add' : ''))
    .join('');
  return `<div class="diff-grid"><div class="diff-col"><div class="col-title">Before</div>${left}</div>`
    + `<div class="diff-col"><div class="col-title">After</div>${right}</div></div>`;
}

function renderUnified(unified, language) {
  const cls = codeClass(language);
  const lines = unified
    .map((l) => {
      const kind = l.kind === 'added' ? 'add' : l.kind === 'removed' ? 'rem' : '';
      const sign = l.kind === 'added' ? '+' : l.kind === 'removed' ? '-' : ' ';
      const text = l.text === '' ? '&nbsp;' : escapeHtml(l.text);
      const inner = cls ? `<code${cls}>${text}</code>` : text;
      return `<div class="line ${kind}"><span class="ln">${sign}${l.n}</span><span class="code">${inner}</span></div>`;
    })
    .join('');
  return `<div class="diff-col">${lines}</div>`;
}

function diffHead(block, defaultLabel) {
  const file = block.filename ? `<span class="file">${escapeHtml(block.filename)}</span>` : `<span class="file">${escapeHtml(defaultLabel)}</span>`;
  const summary = block.summary ? `<span class="muted">${escapeHtml(block.summary)}</span>` : '';
  return `<div class="diff-head">${file}${summary}</div>`;
}

export function renderDiff(block) {
  const { rows, unified } = computeLineDiff(block.before, block.after);
  const body = block.mode === 'unified'
    ? renderUnified(unified, block.language)
    : renderSplit(rows, block.language, annotationLines(block, 'left'), annotationLines(block, 'right'));
  return `<div class="blk"><div class="diff">${diffHead(block, 'diff')}${body}</div>${renderAnnotations(block.annotations)}</div>`;
}

export function renderPatch(block) {
  const lines = String(block.patch ?? '').replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const body = lines
    .map((line) => {
      const kind = classifyPatchLine(line);
      const cls = kind === 'added' ? 'add' : kind === 'removed' ? 'rem' : '';
      const text = line === '' ? '&nbsp;' : escapeHtml(line);
      return `<div class="line ${cls}"><span class="code">${text}</span></div>`;
    })
    .join('');
  return `<div class="blk"><div class="diff">${diffHead(block, 'patch')}<div class="patch">${body}</div></div></div>`;
}

export function renderCode(block) {
  const caption = block.caption ? `<div class="muted">${escapeHtml(block.caption)}</div>` : '';
  return `<div class="blk">${diffHead(block, 'code')}`
    + `<pre class="code-block"><code${codeClass(block.language)}>${escapeHtml(block.code)}</code></pre>${caption}</div>`;
}

export function renderAnnotatedCode(block) {
  const lines = splitLines(block.code);
  const marked = new Set();
  for (const a of block.annotations ?? []) {
    for (const n of parseLineRange(a?.lines)) marked.add(n);
  }
  const cls = codeClass(block.language);
  const body = lines
    .map((line, i) => {
      const n = i + 1;
      const text = line === '' ? '&nbsp;' : escapeHtml(line);
      const inner = cls ? `<code${cls}>${text}</code>` : text;
      const mark = marked.has(n) ? '<span class="mark">&#9679;</span>' : '';
      return `<div class="line"><span class="ln">${n}</span><span class="code">${mark}${inner}</span></div>`;
    })
    .join('');
  return `<div class="blk">${diffHead(block, 'code')}`
    + `<div class="patch numbered">${body}</div>${renderAnnotations(block.annotations)}</div>`;
}
