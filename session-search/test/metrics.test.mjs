import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mrrAtK, ndcgAtK, recallAtK } from '../eval/metrics.mjs';

const grades = { a: 3, b: 1, c: 0 };

test('ndcgAtK is 1 for the ideal ranking', () => {
  assert.equal(ndcgAtK(['a', 'b', 'c'], grades, 10), 1);
});

test('ndcgAtK penalizes a relevant hit ranked lower', () => {
  assert.ok(ndcgAtK(['c', 'b', 'a'], grades, 10) < ndcgAtK(['a', 'b', 'c'], grades, 10));
});

test('recallAtK counts graded-relevant hits in the window', () => {
  assert.equal(recallAtK(['a', 'b'], grades, 10), 1);
  assert.equal(recallAtK(['a'], grades, 10), 0.5);
});

test('mrrAtK uses the first relevant rank', () => {
  assert.equal(mrrAtK(['c', 'b', 'a'], grades, 10), 0.5);
  assert.equal(mrrAtK(['c'], grades, 10), 0);
});
