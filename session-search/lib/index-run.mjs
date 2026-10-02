import { statSync } from 'node:fs';
import {
  CACHE_SCHEMA_VERSION,
  fingerprintFromParts,
  indexDir,
  isFresh,
  readIndexDocs,
  readIndexMeta,
  withLock,
  writeIndex,
} from './core/cache.mjs';
import { CliError } from './core/errors.mjs';
import { capValue, MAX_TEXT_STRING } from './core/cap.mjs';
import { redactText, redactValue } from './core/redact.mjs';
import { validateTurn } from './core/turn.mjs';
import { OPENCODE_HARNESS, extractSessionTurns, sessionDirectory } from './sources/opencode.mjs';
import { PI_HARNESS, extractPiTurns, listPiSessionFiles, readPiSession } from './sources/pi.mjs';

export function inScope(directory, project, scope) {
  if (scope === 'all' || !project) return true;
  const normalize = (value) => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const dir = normalize(directory);
  const base = normalize(project);
  return dir === base || dir.startsWith(`${base}/`);
}

// Indexing is incremental at the session (OpenCode) or file (Pi) level: an
// unchanged source reuses its previously extracted turns, so a reindex never
// re-downloads a whole history. `previous` comes from the existing cache and is
// only trusted when its redaction setting and schema match.
export async function indexOpencode({ client, cacheRoot, scope, project, redact = true, previous, onProgress }) {
  const sessions = await client.listSessions();
  const selected = sessions.filter((session) => inScope(sessionDirectory(session), project, scope));
  const reusable = previous?.turns ? groupBySession(previous.turns) : new Map();
  const previousState = previous?.state ?? {};
  const state = {};
  const turns = [];
  const markers = [];
  let done = 0;

  for (const session of selected) {
    const updated = session.time?.updated ?? 0;
    const prior = previousState[session.id];
    if (prior && prior.updated === updated && reusable.has(session.id)) {
      turns.push(...reusable.get(session.id));
    } else {
      turns.push(...extractSessionTurns(session, await client.listMessages(session.id)));
    }
    state[session.id] = { updated, parent: session.parentID ?? null, title: session.title ?? '', session: session.id, turns: 0 };
    markers.push(`${session.id}:${updated}`);
    done += 1;
    onProgress?.({ harness: OPENCODE_HARNESS, done, total: selected.length, source: session.id });
  }
  return assemble({ harness: OPENCODE_HARNESS, cacheRoot, scope, project, turns, markers, redact, sources: selected.length, state });
}

export function indexPi({
  sessionsRoot,
  cacheRoot,
  scope,
  project,
  redact = true,
  previous,
  onProgress,
  listFiles = listPiSessionFiles,
  readSession = readPiSession,
  stat = statSync,
}) {
  const files = listFiles(sessionsRoot);
  const reusable = previous?.turns ? groupBySession(previous.turns) : new Map();
  const previousState = previous?.state ?? {};
  const state = {};
  const turns = [];
  const markers = [];
  let sources = 0;
  let done = 0;

  for (const file of files) {
    const info = stat(file);
    const prior = previousState[file];
    if (
      prior &&
      prior.mtimeMs === info.mtimeMs &&
      prior.size === info.size &&
      inScope(prior.project, project, scope) &&
      reusable.has(prior.session)
    ) {
      turns.push(...reusable.get(prior.session));
      state[file] = { ...prior };
    } else {
      const { header, entries } = readSession(file);
      if (!header.id || !inScope(header.cwd, project, scope)) continue;
      turns.push(...extractPiTurns(header, entries));
      state[file] = {
        mtimeMs: info.mtimeMs,
        size: info.size,
        session: header.id,
        project: header.cwd,
        parent: header.parentSession ?? null,
        turns: 0,
      };
    }
    sources += 1;
    markers.push(`${file}:${info.mtimeMs}:${info.size}`);
    done += 1;
    onProgress?.({ harness: PI_HARNESS, done, total: files.length, source: file });
  }
  return assemble({ harness: PI_HARNESS, cacheRoot, scope, project, turns, markers, redact, sources, state });
}

function groupBySession(turns) {
  const map = new Map();
  for (const turn of turns) {
    if (!map.has(turn.session)) map.set(turn.session, []);
    map.get(turn.session).push(turn);
  }
  return map;
}

function assemble({ harness, cacheRoot, scope, project, turns, markers, redact, sources, state }) {
  const out = redact ? turns.map(redactTurn) : turns;
  const invalid = [];
  for (const turn of out) {
    const problems = validateTurn(turn);
    if (problems.length) invalid.push(`${turn.session}#${turn.seq}: ${problems.join('; ')}`);
  }
  if (invalid.length) throw new CliError(`source produced invalid turns:\n  ${invalid.slice(0, 5).join('\n  ')}`);

  const counts = new Map();
  for (const turn of out) counts.set(turn.session, (counts.get(turn.session) ?? 0) + 1);
  for (const entry of Object.values(state)) entry.turns = counts.get(entry.session) ?? 0;

  const fingerprint = fingerprintFromParts(markers);
  const meta = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    harness,
    scope,
    project,
    generatedAt: new Date().toISOString(),
    fingerprint,
    sessions: sources,
    turns: out.length,
    redacted: !!redact,
    state,
  };
  return { dir: indexDir(cacheRoot, harness, `${scope}:${project}`), meta, turns: out, fingerprint };
}

export function persistIndex({ dir, meta, turns }, { force = false } = {}) {
  if (!force && isFresh(readIndexMeta(dir), meta.fingerprint)) return { dir, meta, skipped: true };
  withLock(dir, () => writeIndex(dir, { meta, turns }));
  return { dir, meta, skipped: false };
}

// Previous turns are reused as-is, so only reuse them when the current run would
// have produced the same redaction; otherwise force a full re-extraction.
export function loadPrevious(dir, redact) {
  const meta = readIndexMeta(dir);
  if (!meta || meta.schemaVersion !== CACHE_SCHEMA_VERSION) return undefined;
  if (!!meta.redacted !== !!redact) return undefined;
  return { turns: readIndexDocs(dir), state: meta.state ?? {}, meta };
}

export function redactTurn(turn) {
  const input = turn.input === null ? null : capValue(redactValue(turn.input));
  return { ...turn, text: capValue(redactText(turn.text), MAX_TEXT_STRING), input };
}
