import { statSync } from 'node:fs';
import {
  CACHE_SCHEMA_VERSION,
  fingerprintFromParts,
  indexDir,
  isFresh,
  readIndexMeta,
  withLock,
  writeIndex,
} from './core/cache.mjs';
import { CliError } from './core/errors.mjs';
import { redactText, redactValue } from './core/redact.mjs';
import { validateTurn } from './core/turn.mjs';
import { OPENCODE_HARNESS, extractSessionTurns, sessionDirectory } from './sources/opencode.mjs';
import { PI_HARNESS, extractPiTurns, listPiSessionFiles, readPiSession } from './sources/pi.mjs';

export function inScope(directory, project, scope) {
  if (scope === 'all' || !project) return true;
  const dir = String(directory || '');
  const base = project.endsWith('/') ? project : `${project}/`;
  return dir === project || dir.startsWith(base);
}

export async function indexOpencode({ client, cacheRoot, scope, project, redact = true }) {
  const sessions = await client.listSessions();
  const selected = sessions.filter((session) => inScope(sessionDirectory(session), project, scope));
  const turns = [];
  const markers = [];
  for (const session of selected) {
    markers.push(`${session.id}:${session.time?.updated ?? 0}`);
    turns.push(...extractSessionTurns(session, await client.listMessages(session.id)));
  }
  return assemble({ harness: OPENCODE_HARNESS, cacheRoot, scope, project, turns, markers, redact, sources: selected.length });
}

export function indexPi({
  sessionsRoot,
  cacheRoot,
  scope,
  project,
  redact = true,
  listFiles = listPiSessionFiles,
  readSession = readPiSession,
  stat = statSync,
}) {
  const turns = [];
  const markers = [];
  let sources = 0;
  for (const file of listFiles(sessionsRoot)) {
    const { header, entries } = readSession(file);
    if (!header.id || !inScope(header.cwd, project, scope)) continue;
    sources += 1;
    const info = stat(file);
    markers.push(`${file}:${info.mtimeMs}:${info.size}`);
    turns.push(...extractPiTurns(header, entries));
  }
  return assemble({ harness: PI_HARNESS, cacheRoot, scope, project, turns, markers, redact, sources });
}

function assemble({ harness, cacheRoot, scope, project, turns, markers, redact, sources }) {
  const out = redact ? turns.map(redactTurn) : turns;
  const invalid = [];
  for (const turn of out) {
    const problems = validateTurn(turn);
    if (problems.length) invalid.push(`${turn.session}#${turn.seq}: ${problems.join('; ')}`);
  }
  if (invalid.length) throw new CliError(`source produced invalid turns:\n  ${invalid.slice(0, 5).join('\n  ')}`);
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
  };
  return { dir: indexDir(cacheRoot, harness, `${scope}:${project}`), meta, turns: out, fingerprint };
}

export function persistIndex({ dir, meta, turns }, { force = false } = {}) {
  if (!force && isFresh(readIndexMeta(dir), meta.fingerprint)) return { dir, meta, skipped: true };
  withLock(dir, () => writeIndex(dir, { meta, turns }));
  return { dir, meta, skipped: false };
}

export function redactTurn(turn) {
  return { ...turn, text: redactText(turn.text), input: turn.input === null ? null : redactValue(turn.input) };
}
