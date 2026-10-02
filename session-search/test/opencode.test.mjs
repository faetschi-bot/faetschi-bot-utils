import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENCODE_HARNESS,
  createOpencodeClient,
  extractSessionTurns,
  readOpencodeEndpoint,
  sessionDirectory,
} from '../lib/sources/opencode.mjs';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('readOpencodeEndpoint requires both url and password', () => {
  const withPasswordOnly = readOpencodeEndpoint({
    env: { XDG_STATE_HOME: '/state' },
    home: '/home',
    exists: () => true,
    readFile: () => JSON.stringify({ password: 'p' }),
  });
  assert.equal(withPasswordOnly, undefined);

  const endpoint = readOpencodeEndpoint({
    env: { XDG_STATE_HOME: '/state' },
    home: '/home',
    exists: () => true,
    readFile: () => JSON.stringify({ url: 'http://127.0.0.1:1/', password: 'p' }),
  });
  assert.deepEqual(endpoint, { url: 'http://127.0.0.1:1', password: 'p' });
});

test('listSessions walks the cursor and re-sends limit without order', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.searchParams.has('cursor')) return json({ data: [{ id: 'b' }], cursor: { next: null } });
    return json({ data: [{ id: 'a' }], cursor: { next: 'c1' } });
  };
  const client = createOpencodeClient({ url: 'http://x', password: 'p', fetchImpl });
  const sessions = await client.listSessions();
  assert.deepEqual(sessions.map((s) => s.id), ['a', 'b']);
  assert.equal(calls[0].searchParams.get('order'), 'desc');
  assert.equal(calls[1].searchParams.get('limit'), '200');
  assert.equal(calls[1].searchParams.has('order'), false);
});

test('extractSessionTurns keeps tier content and drops tool output', () => {
  const session = { id: 'ses_1', parentID: null, location: { directory: '/p' } };
  const messages = [
    { type: 'user', id: 'm1', time: { created: 1 }, text: 'hello' },
    {
      type: 'assistant',
      id: 'm2',
      time: { created: 2 },
      content: [
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: 'answer' },
        {
          type: 'tool',
          id: 't1',
          name: 'bash',
          state: { status: 'completed', input: { command: 'ls' }, content: [{ type: 'text', text: 'SECRET_OUTPUT' }] },
        },
      ],
    },
    {
      type: 'assistant',
      id: 'm3',
      time: { created: 3 },
      content: [{ type: 'tool', name: 'edit', state: { status: 'streaming', input: '{"partial' } }],
    },
    { type: 'compaction', id: 'm4', status: 'completed', summary: 'summary text', time: { created: 4 } },
    { type: 'compaction', id: 'm5', status: 'failed', time: { created: 5 } },
    { type: 'shell', id: 'm6', command: 'npm test', time: { created: 6 } },
    { type: 'idle', id: 'm7', time: { created: 7 }, outcome: 'succeeded' },
  ];

  const turns = extractSessionTurns(session, messages);
  assert.deepEqual(
    turns.map((turn) => `${turn.role}/${turn.kind}`),
    ['user/text', 'assistant/reasoning', 'assistant/text', 'assistant/action', 'compaction/summary', 'shell/action'],
  );
  assert.equal(turns.every((turn) => turn.harness === OPENCODE_HARNESS && turn.project === '/p'), true);
  const action = turns.find((turn) => turn.kind === 'action');
  assert.deepEqual(action.input, { command: 'ls' });
  assert.equal(JSON.stringify(turns).includes('SECRET_OUTPUT'), false);
  assert.equal(sessionDirectory(session), '/p');
});
