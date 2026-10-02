import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, chunkText, searchSessions } from '../lib/core/retrieval.mjs';

function turn(overrides) {
  return {
    v: 1,
    harness: 'pi',
    project: '/p',
    session: 's',
    title: '',
    parent: null,
    seq: 0,
    time: 0,
    role: 'user',
    kind: 'text',
    text: '',
    tool: null,
    input: null,
    refs: {},
    ...overrides,
  };
}

test('chunkText windows long text with overlap', () => {
  const chunks = chunkText('a'.repeat(2000), { maxChars: 800, overlapChars: 200 });
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].length, 800);
});

test('searchSessions finds the matching session and returns a snippet', () => {
  const turns = [
    turn({ session: 's1', seq: 0, title: 'Rate limiter design', text: 'add a rate limiter to the API client' }),
    turn({ session: 's2', seq: 0, title: 'Unrelated', text: 'database migration notes' }),
  ];
  const results = searchSessions(buildIndex(turns), 'rate limiter');
  assert.equal(results[0].session, 's1');
  assert.match(results[0].snippet, /rate limiter/i);
});

test('title boost lifts a title-only match', () => {
  const turns = [
    turn({ session: 's1', seq: 0, title: 'playwright provisioning', text: 'unrelated body' }),
    turn({ session: 's2', seq: 0, title: 'other', text: 'a note about playwright provisioning here' }),
  ];
  const results = searchSessions(buildIndex(turns), 'playwright provisioning');
  assert.equal(results[0].session, 's1');
});

test('folds a child session into its parent unless it clearly wins', () => {
  const turns = [
    turn({ session: 'p', seq: 0, text: 'authentication handling overview' }),
    turn({ session: 'c', parent: 'p', seq: 0, text: 'authentication handling detail' }),
  ];
  const index = buildIndex(turns);
  assert.deepEqual(searchSessions(index, 'authentication handling').map((r) => r.session), ['p']);
  assert.equal(searchSessions(index, 'authentication handling', { includeSubagents: true }).length, 2);
});
