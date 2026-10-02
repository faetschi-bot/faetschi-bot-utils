import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactText, redactValue } from '../lib/core/redact.mjs';

test('redacts known credential shapes', () => {
  assert.equal(redactText('token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'), 'token [redacted]');
  assert.equal(redactText('AKIAIOSFODNN7EXAMPLE'), '[redacted]');
  assert.equal(redactText('sk-abcdefghijklmnopqrstuvwx'), '[redacted]');
  assert.match(redactText('Authorization: Bearer header.payload.sig'), /\[redacted\]/);
  assert.match(redactText('https://x/y?token=abc123&z=1'), /token=\[redacted\]/);
  assert.match(redactText('api_key: sk-abcdefghijklmnopqrstuvwx'), /\[redacted\]/);
  assert.match(redactText('password=hunter2hunter2'), /\[redacted\]/);
});

test('redactValue walks objects and arrays without mutating', () => {
  const input = { a: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345', b: ['AKIAIOSFODNN7EXAMPLE'] };
  const out = redactValue(input);
  assert.equal(out.a, '[redacted]');
  assert.equal(out.b[0], '[redacted]');
  assert.equal(input.a, 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
});

test('ordinary prose is unchanged', () => {
  assert.equal(redactText('the quick brown fox'), 'the quick brown fox');
});
