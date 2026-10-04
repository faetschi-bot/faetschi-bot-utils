import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPatchLine, computeLineDiff, parseLineRange } from '../lib/recap/diff.mjs';

// --- diff -------------------------------------------------------------------

test('computeLineDiff marks added, removed, changed, and context rows', () => {
  const { rows } = computeLineDiff('a\nb\nc\n', 'a\nB\nc\nd\n');
  const kinds = rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['context', 'changed', 'context', 'added']);
  const changed = rows[1];
  assert.equal(changed.left.text, 'b');
  assert.equal(changed.right.text, 'B');
  assert.equal(changed.left.n, 2);
  assert.equal(changed.right.n, 2);
});

test('computeLineDiff aligns a pure insertion as an added-only row', () => {
  const { rows } = computeLineDiff('a\n', 'a\nnew\n');
  assert.equal(rows[1].kind, 'added');
  assert.equal(rows[1].left, null);
  assert.equal(rows[1].right.n, 2);
});

test('parseLineRange parses singles and inclusive ranges, rejects junk', () => {
  assert.deepEqual(parseLineRange('4'), [4]);
  assert.deepEqual(parseLineRange('2-5'), [2, 3, 4, 5]);
  assert.deepEqual(parseLineRange('5-2'), []);
  assert.deepEqual(parseLineRange('x'), []);
});

test('classifyPatchLine distinguishes meta, hunk, add, remove, and context', () => {
  assert.equal(classifyPatchLine('diff --git a/x b/x'), 'meta');
  assert.equal(classifyPatchLine('@@ -1 +1 @@'), 'hunk');
  assert.equal(classifyPatchLine('+added'), 'added');
  assert.equal(classifyPatchLine('-removed'), 'removed');
  assert.equal(classifyPatchLine(' context'), 'context');
});
