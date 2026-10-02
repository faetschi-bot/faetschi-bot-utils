import { tokenize } from './tokenize.mjs';

const WINDOW = 160;

// Return a single-line window around the first query term so the agent sees the
// matched span, not just the head of the turn.
export function makeSnippet(text, query) {
  const source = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!source) return '';
  const terms = tokenize(query, 'text');
  const lower = source.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index !== -1 && (at === -1 || index < at)) at = index;
  }
  if (at === -1) return source.slice(0, WINDOW * 2);
  const start = Math.max(0, at - WINDOW);
  const end = Math.min(source.length, at + WINDOW);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
}
