import MiniSearch from 'minisearch';
import { makeSnippet } from './snippet.mjs';
import { tokenize } from './tokenize.mjs';

// BM25+ (d > 0) lower-bounds term frequency so long reasoning turns are not
// unfairly penalized. k1/b/d are MiniSearch's BM25Params.
const BM25 = { k: 1.2, b: 0.7, d: 0.5 };
const FIELDS = ['title', 'text', 'tool', 'path'];
const STORE_FIELDS = ['harness', 'session', 'project', 'parent', 'title', 'role', 'kind', 'time', 'seq', 'chunk', 'text'];
const SEARCH_OPTIONS = {
  boost: { title: 3, text: 1, tool: 1, path: 1.5 },
  prefix: true,
  fuzzy: false,
};

const MAX_CHARS = 800;
const OVERLAP_CHARS = 200;
const CHILD_SCORE_MARGIN = 1.15;

export function chunkText(text, { maxChars = MAX_CHARS, overlapChars = OVERLAP_CHARS } = {}) {
  const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(clean.length, start + maxChars);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - overlapChars;
  }
  return chunks;
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
// small bonus for matching more turns. Child sessions are folded into their
// parent unless they clearly outrank it.
export function searchSessions(index, query, { limit = 10, includeSubagents = false } = {}) {
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
