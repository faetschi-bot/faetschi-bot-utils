import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { makeTurn } from '../core/turn.mjs';
import { asArray, contentText, stableStringify, toMs, truncateText } from './normalize.mjs';

export const PI_HARNESS = 'pi';
const MAX_INPUT_CHARS = 4000;

export function defaultPiSessionsDir({ env = process.env, home = homedir() } = {}) {
  return env.PI_CODING_AGENT_SESSION_DIR || join(home, '.pi', 'agent', 'sessions');
}

// Pi groups sessions per working directory by default, but a custom sessionDir is
// flat. A recursive walk handles both; sorting keeps fingerprints stable.
export function listPiSessionFiles(root, { readdir = readdirSync, exists = existsSync } = {}) {
  if (!exists(root)) return [];
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
    }
  };
  walk(root);
  return files.sort();
}

// Tolerant parser: v1 files have no tree ids, v2 uses parentId, v3 renamed the
// hookMessage role to custom. Unknown lines are skipped, not fatal.
export function parsePiSession(text) {
  const header = { id: '', cwd: '', parentSession: null, version: 1 };
  const entries = [];
  let seenHeader = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!seenHeader && entry.type === 'session') {
      header.id = entry.id ?? '';
      header.cwd = entry.cwd ?? '';
      header.parentSession = entry.parentSession ?? null;
      header.version = entry.version ?? 1;
      seenHeader = true;
      continue;
    }
    entries.push(entry);
  }
  return { header, entries };
}

export function readPiSession(file, { readFile = (path) => readFileSync(path, 'utf8') } = {}) {
  return parsePiSession(readFile(file));
}

// Pure: normalize raw Pi entries. Tool results are not indexed because the
// matching toolCall already captured the action (name + arguments).
export function extractPiTurns(header, entries) {
  const project = header.cwd ?? '';
  const session = header.id ?? '';
  const parent = header.parentSession ?? null;
  const title = lastSessionName(entries);
  const turns = [];
  let seq = 0;

  const emit = (role, kind, text, extra = {}) => {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return;
    turns.push(
      makeTurn({
        harness: PI_HARNESS,
        project,
        session,
        title,
        parent,
        seq: seq++,
        time: extra.time ?? 0,
        role,
        kind,
        text: clean,
        tool: extra.tool ?? null,
        input: extra.input ?? null,
        refs: extra.refs ?? {},
      }),
    );
  };

  for (const entry of entries) {
    const time = toMs(entry.timestamp) ?? 0;
    const refs = { entryId: entry.id };
    if (entry.type === 'message' && entry.message) {
      emitMessage(entry.message, emit, refs);
    } else if (entry.type === 'compaction' || entry.type === 'branch_summary') {
      emit('compaction', 'summary', entry.summary, { time, refs });
    } else if (entry.type === 'custom_message') {
      emit('synthetic', 'text', contentText(entry.content), { time, refs });
    }
    // model_change, thinking_level_change, usage, custom, label, session_info skipped.
  }
  return turns;
}

function emitMessage(message, emit, refs) {
  const time = toMs(message.timestamp) ?? 0;
  if (message.role === 'user') {
    emit('user', 'text', contentText(message.content), { time, refs });
    return;
  }
  if (message.role === 'assistant') {
    for (const block of asArray(message.content)) {
      if (block.type === 'text') emit('assistant', 'text', block.text, { time, refs });
      else if (block.type === 'thinking') emit('assistant', 'reasoning', block.thinking, { time, refs });
      else if (block.type === 'toolCall') {
        emit('assistant', 'action', truncateText(`${block.name} ${stableStringify(block.arguments)}`, MAX_INPUT_CHARS), {
          time,
          tool: block.name,
          input: block.arguments ?? null,
          refs,
        });
      }
    }
    return;
  }
  if (message.role === 'bashExecution') {
    emit('shell', 'action', message.command, { time, refs });
  }
  // toolResult and system are not indexed.
}

// Pi stores the display name in a session_info entry, not the header.
function lastSessionName(entries) {
  let name = '';
  for (const entry of entries) {
    if (entry.type === 'session_info' && typeof entry.name === 'string') name = entry.name;
  }
  return name;
}
