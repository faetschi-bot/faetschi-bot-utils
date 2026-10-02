import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PI_HARNESS,
  defaultPiSessionsDir,
  extractPiTurns,
  listPiSessionFiles,
  parsePiSession,
} from '../lib/sources/pi.mjs';

test('parsePiSession splits the header from entries and tolerates junk lines', () => {
  const text = [
    '{"type":"session","version":3,"id":"s1","cwd":"/p","parentSession":"/parent.jsonl"}',
    'not json',
    '{"type":"message","id":"e1","timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"user","content":"hi","timestamp":1767225600000}}',
  ].join('\n');
  const { header, entries } = parsePiSession(text);
  assert.deepEqual(header, { id: 's1', cwd: '/p', parentSession: '/parent.jsonl', version: 3 });
  assert.equal(entries.length, 1);
});

test('extractPiTurns normalizes dialogue, reasoning, actions, and summaries', () => {
  const header = { id: 's1', cwd: '/p', parentSession: null, version: 3 };
  const entries = [
    {
      type: 'message',
      id: 'e1',
      timestamp: '2026-01-01T00:00:00.000Z',
      message: { role: 'user', content: 'hi', timestamp: 1 },
    },
    {
      type: 'message',
      id: 'e2',
      timestamp: '2026-01-01T00:00:01.000Z',
      message: {
        role: 'assistant',
        timestamp: 2,
        content: [
          { type: 'text', text: 'yo' },
          { type: 'thinking', thinking: 'hmm' },
          { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls' } },
        ],
      },
    },
    {
      type: 'message',
      id: 'e3',
      message: { role: 'toolResult', toolName: 'bash', content: [{ type: 'text', text: 'OUTPUT' }], timestamp: 3 },
    },
    { type: 'compaction', id: 'e4', summary: 'sum', timestamp: '2026-01-01T00:00:04.000Z' },
    { type: 'custom_message', id: 'e5', content: 'note' },
  ];
  const turns = extractPiTurns(header, entries);
  assert.deepEqual(
    turns.map((turn) => `${turn.role}/${turn.kind}`),
    ['user/text', 'assistant/text', 'assistant/reasoning', 'assistant/action', 'compaction/summary', 'synthetic/text'],
  );
  assert.equal(turns[0].harness, PI_HARNESS);
  assert.deepEqual(turns[3].input, { command: 'ls' });
  assert.equal(JSON.stringify(turns).includes('OUTPUT'), false);
});

test('defaultPiSessionsDir honors the agent dir and session-dir overrides', () => {
  assert.equal(defaultPiSessionsDir({ env: { PI_CODING_AGENT_DIR: '/agent' }, home: '/h' }), join('/agent', 'sessions'));
  assert.equal(defaultPiSessionsDir({ env: { PI_CODING_AGENT_SESSION_DIR: '/sessions' }, home: '/h' }), '/sessions');
  assert.equal(defaultPiSessionsDir({ env: {}, home: '/h' }), join('/h', '.pi', 'agent', 'sessions'));
});

test('listPiSessionFiles finds nested jsonl files only', () => {  const root = mkdtempSync(join(tmpdir(), 'session-search-pi-'));
  try {
    const nested = join(root, '--p--');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'a.jsonl'), '');
    writeFileSync(join(nested, 'ignore.txt'), '');
    const files = listPiSessionFiles(root);
    assert.equal(files.length, 1);
    assert.match(files[0], /a\.jsonl$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
