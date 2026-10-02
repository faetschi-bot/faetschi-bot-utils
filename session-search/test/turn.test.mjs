import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTurn, validateTurn, TURN_SCHEMA_VERSION } from '../lib/core/turn.mjs';

test('makeTurn produces a valid turn', () => {
  const turn = makeTurn({
    harness: 'pi',
    session: 's1',
    seq: 0,
    time: 1,
    role: 'user',
    kind: 'text',
    text: 'hello',
  });
  assert.equal(turn.v, TURN_SCHEMA_VERSION);
  assert.equal(turn.parent, null);
  assert.deepEqual(validateTurn(turn), []);
});

test('validateTurn reports each invalid field with context', () => {
  const problems = validateTurn({
    v: 2,
    harness: '',
    project: 5,
    session: '',
    role: 'nope',
    kind: 'nope',
    text: 5,
    seq: -1,
    time: Number.NaN,
  });
  assert.ok(problems.length >= 7, `expected several problems, got ${JSON.stringify(problems)}`);
});
