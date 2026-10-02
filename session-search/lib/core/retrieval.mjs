import MiniSearch from 'minisearch';
import { makeSnippet } from './snippet.mjs';
import { tokenize } from './tokenize.mjs';

// BM25+ (d > 0) lower-bounds term frequency so long reasoning turns are not
// unfairly penalized. k1/b/d are MiniSearch's BM25Params.
const BM25 = { k: 1.2, b: 0.7, d: 0.5 };
// Per-role fields approximate BM25F: each turn's text lands in the field for its
// role/kind, and MiniSearch multiplies that field's BM25 score by its boost.
const CONTENT_FIELDS = ['user', 'assistant', 'reasoning', 'compaction', 'action', 'other'];
const FIELDS = ['title', ...CONTENT_FIELDS, 'tool', 'path'];
const STORE_FIELDS = ['harness', 'session', 'project', 'parent', 'title', 'role', 'kind', 'time', 'seq', 'chunk', 'text'];
const SEARCH_OPTIONS = {
  boost: { title: 3, user: 2.5, assistant: 1.5, reasoning: 0.6, compaction: 1, action: 1, other: 1, tool: 1, path: 1.5 },
  prefix: true,
  fuzzy: false,
};

const MAX_CHARS = 800;
const OVERLAP_CHARS = 200;
const CHILD_SCORE_MARGIN = 1.15;

export function chunkText(text, { maxChars = MAX_CHARS, overlapChars = OVERLAP_CHARS } = {}) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  let current = '';
  for (const block of splitBlocks(clean)) {
    if (block.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(...hardSplit(block, maxChars, overlapChars));
      continue;
    }
    if (current && current.length + block.length + 1 > maxChars) {
      chunks.push(current);
      current = overlapTail(current, overlapChars);
    }
    current = current ? `${current}\n${block}` : block;
  }
  if (current) chunks.push(current);
  return chunks;
}

// Split on blank lines and markdown headings so a chunk follows the document's
// structure; code fences are kept whole. Oversized blocks fall back to windows.
function splitBlocks(text) {
  const blocks = [];
  let buffer = [];
  let fence = false;
  const flush = () => {
    const block = buffer.join('\n').trim();
    if (block) blocks.push(block);
    buffer = [];
  };
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    const heading = !fence && /^#{1,6}\s/.test(line);
    if (!fence && (heading || line.trim() === '')) {
      flush();
      if (heading) buffer.push(line);
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks.length ? blocks : [text.trim()];
}

function hardSplit(text, maxChars, overlapChars) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - overlapChars;
  }
  return chunks;
}

function overlapTail(text, size) {
  return text.length <= size ? text : text.slice(text.length - size);
}

export function toDocuments(turns) {
  const documents = [];
  for (const turn of turns) {
    const chunks = chunkText(turn.text);
    chunks.forEach((chunk, index) => {
      documents.push({
        id: `${turn.session}:${turn.seq}:${index}`,
        harness: turn.harness,
        session: turn.session,
        project: turn.project,
        parent: turn.parent,
        title: turn.title ?? '',
        role: turn.role,
        kind: turn.kind,
        time: turn.time,
        seq: turn.seq,
        chunk: index,
        tool: turn.tool ?? '',
        path: inputPath(turn.input),
        text: chunk,
        [contentField(turn)]: chunk,
      });
    });
  }
  return documents;
}

export function buildIndex(turns) {
  const index = new MiniSearch({
    idField: 'id',
    fields: FIELDS,
    storeFields: STORE_FIELDS,
    tokenize: (text, field) => tokenize(text, field),
    processTerm: (term) => term,
    searchOptions: SEARCH_OPTIONS,
    bm25: BM25,
  });
  index.addAll(toDocuments(turns));
  return index;
}

// Rank chunks, then aggregate to sessions: sum of the top 3 chunk scores plus a
// small bonus for matching more turns. An optional weak recency decay (0 = off)
// nudges newer sessions up. Child sessions are folded into their parent unless
// they clearly outrank it.
export function searchSessions(index, query, { limit = 10, includeSubagents = false, recency = 0, now = Date.now() } = {}) {
  const hits = index.search(query);
  const bySession = new Map();
  for (const hit of hits) {
    if (!bySession.has(hit.session)) {
      bySession.set(hit.session, {
        session: hit.session,
        title: hit.title,
        project: hit.project,
        parent: hit.parent,
        matched: 0,
        chunks: [],
      });
    }
    const entry = bySession.get(hit.session);
    entry.matched += 1;
    entry.chunks.push(hit);
  }

  let sessions = [...bySession.values()].map((entry) => {
    const top = [...entry.chunks].sort((a, b) => b.score - a.score).slice(0, 3);
    const score = top.reduce((sum, hit) => sum + hit.score, 0) + Math.log(1 + entry.matched);
    return { ...entry, score, best: top[0] };
  });
  if (recency > 0) applyRecency(sessions, recency, now);
  sessions.sort((a, b) => b.score - a.score);
  if (!includeSubagents) sessions = collapseSubagents(sessions);

  return sessions.slice(0, limit).map((entry) => ({
    harness: entry.best.harness,
    session: entry.session,
    title: entry.title,
    project: entry.project,
    parent: entry.parent,
    score: Number(entry.score.toFixed(3)),
    matched: entry.matched,
    snippet: makeSnippet(entry.best.text, query),
    match: { role: entry.best.role, kind: entry.best.kind, time: entry.best.time, seq: entry.best.seq },
  }));
}

const RECENCY_HALF_LIFE_DAYS = 180;

function applyRecency(sessions, weight, now) {
  for (const session of sessions) {
    const time = session.best.time || now;
    const ageDays = Math.max(0, (now - time) / 86_400_000);
    const decay = 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
    session.score *= (1 - weight) + weight * decay;
  }
}

function collapseSubagents(sessions) {
  const byId = new Map(sessions.map((session) => [session.session, session]));
  const dropped = new Set();
  for (const session of sessions) {
    if (!session.parent) continue;
    const parent = byId.get(session.parent);
    if (parent && session.score <= parent.score * CHILD_SCORE_MARGIN) dropped.add(session.session);
  }
  return sessions.filter((session) => !dropped.has(session.session));
}

function inputPath(input) {
  if (!input || typeof input !== 'object') return '';
  return input.filePath || input.path || input.file || '';
}

// Route a turn's searchable text into the field that carries its role boost.
function contentField(turn) {
  if (turn.kind === 'action') return 'action';
  if (turn.role === 'user') return 'user';
  if (turn.role === 'assistant' && turn.kind === 'reasoning') return 'reasoning';
  if (turn.role === 'assistant') return 'assistant';
  if (turn.role === 'compaction') return 'compaction';
  return 'other';
}
