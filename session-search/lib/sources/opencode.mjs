import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../core/errors.mjs';
import { makeTurn } from '../core/turn.mjs';
import { stableStringify, truncateText } from './normalize.mjs';

export const OPENCODE_HARNESS = 'opencode';
const MAX_INPUT_CHARS = 4000;
const DEFAULT_TIMEOUT_MS = 30000;

export function opencodeServicePath({ env = process.env, home = homedir() } = {}) {
  const stateHome = env.XDG_STATE_HOME || join(home, '.local', 'state');
  return join(stateHome, 'opencode', 'service.json');
}

// The V2 service registers itself here; the URL is required, so a legacy file
// with only a password is treated as absent.
export function readOpencodeEndpoint({
  env = process.env,
  home = homedir(),
  exists = existsSync,
  readFile = (path) => readFileSync(path, 'utf8'),
} = {}) {
  const file = opencodeServicePath({ env, home });
  if (!exists(file)) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(readFile(file));
  } catch {
    return undefined;
  }
  if (!parsed?.url || !parsed?.password) return undefined;
  return { url: String(parsed.url).replace(/\/$/, ''), password: String(parsed.password) };
}

export function createOpencodeClient({ url, password, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;

  async function get(path, params) {
    const target = new URL(url + path);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(target, {
      headers: { authorization },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new CliError(`OpenCode API GET ${path} failed: HTTP ${response.status}`);
    return response.json();
  }

  // The cursor carries `order` but not `limit`, so limit is re-sent on every
  // page and order is never combined with a cursor (the API rejects that).
  async function listSessions({ order = 'desc', limit = 200 } = {}) {
    const sessions = [];
    let cursor;
    do {
      const page = await get('/api/session', cursor ? { limit, cursor } : { order, limit });
      sessions.push(...(page.data ?? []));
      cursor = page.cursor?.next ?? undefined;
    } while (cursor);
    return sessions;
  }

  async function listMessages(sessionID, { limit = 100 } = {}) {
    const messages = [];
    let cursor;
    do {
      const page = await get(`/api/session/${sessionID}/message`, cursor ? { limit, cursor } : { order: 'asc', limit });
      messages.push(...(page.data ?? []));
      cursor = page.cursor?.next ?? undefined;
    } while (cursor);
    return messages;
  }

  async function getSession(sessionID) {
    return (await get(`/api/session/${sessionID}`)).data;
  }

  return { listSessions, listMessages, getSession };
}

export function sessionDirectory(session) {
  return session.location?.directory ?? session.directory ?? '';
}

// Pure: turn one OpenCode session and its message timeline into normalized
// Turns. Tool outputs and non-content events are intentionally dropped here.
export function extractSessionTurns(session, messages) {
  const project = sessionDirectory(session);
  const sessionID = session.id;
  const parent = session.parentID ?? null;
  const turns = [];
  let seq = 0;

  const emit = (role, kind, text, extra = {}) => {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return;
    turns.push(
      makeTurn({
        harness: OPENCODE_HARNESS,
        project,
        session: sessionID,
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

  for (const message of messages) {
    const time = message.time?.created ?? 0;
    const refs = { messageId: message.id };
    if (message.type === 'user') {
      emit('user', 'text', userText(message), { time, refs });
    } else if (message.type === 'assistant') {
      for (const part of message.content ?? []) emitAssistantPart(part, emit, time, refs);
    } else if (message.type === 'compaction') {
      if (message.status === 'completed') emit('compaction', 'summary', message.summary, { time, refs });
    } else if (message.type === 'shell') {
      emit('shell', 'action', message.command, { time, tool: 'shell', refs });
    }
    // idle, *-switched, system, skill, synthetic are not indexed.
  }
  return turns;
}

function emitAssistantPart(part, emit, time, refs) {
  if (part.type === 'text') {
    emit('assistant', 'text', part.text, { time, refs });
  } else if (part.type === 'reasoning') {
    emit('assistant', 'reasoning', part.text, { time, refs });
  } else if (part.type === 'tool') {
    const state = part.state ?? {};
    if (state.status === 'streaming') return; // input is a partial string
    const input = state.input ?? null;
    emit('assistant', 'action', truncateText(`${part.name} ${stableStringify(input)}`, MAX_INPUT_CHARS), {
      time,
      tool: part.name,
      input,
      refs: { ...refs, partId: part.id },
    });
  }
}

// A user message can carry only attachments; keep the names so the turn is not lost.
function userText(message) {
  if (typeof message.text === 'string' && message.text.trim()) return message.text;
  const names = [];
  for (const file of message.files ?? []) names.push(file.filename || file.name || file.uri || '');
  for (const skill of message.skills ?? []) names.push(skill.id || skill.name || '');
  for (const agent of message.agents ?? []) names.push(agent.id || agent.name || '');
  return names.filter(Boolean).join(' ');
}
