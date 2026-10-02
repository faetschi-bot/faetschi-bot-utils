import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_INPUT_STRING, capValue } from '../lib/core/cap.mjs';

test('capValue truncates long strings and preserves short ones', () => {
  const long = 'x'.repeat(MAX_INPUT_STRING + 50);
  const capped = capValue(long);
  assert.ok(capped.length < long.length);
  assert.match(capped, /…\[truncated\]$/);
  assert.equal(capValue('short'), 'short');
});

test('capValue walks nested objects and arrays without mutating', () => {
  const input = { filePath: '/a.ts', oldString: 'y'.repeat(3000), lines: ['z'.repeat(2500)] };
  const out = capValue(input);
  assert.equal(out.filePath, '/a.ts');
  assert.match(out.oldString, /…\[truncated\]$/);
  assert.match(out.lines[0], /…\[truncated\]$/);
  assert.equal(input.oldString.length, 3000);
});
