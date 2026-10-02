import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../lib/core/tokenize.mjs';

test('keeps the whole token and its camelCase subtokens', () => {
  const terms = tokenize('getUserById');
  assert.ok(terms.includes('getuserbyid'));
  for (const part of ['get', 'user', 'by', 'id']) assert.ok(terms.includes(part), part);
});

test('splits snake_case, kebab-case, and letter/digit boundaries', () => {
  const terms = tokenize('parse_config-file2');
  for (const part of ['parse', 'config', 'file', '2']) assert.ok(terms.includes(part), part);
});

test('splits acronym runs', () => {
  assert.ok(tokenize('HTTPServer').includes('http'));
  assert.ok(tokenize('HTTPServer').includes('server'));
});

test('emits path-suffix tokens', () => {
  const terms = tokenize('see src/util/config.ts now');
  assert.ok(terms.includes('config.ts'));
  assert.ok(terms.includes('util/config.ts'));
});

test('is empty-safe and normalizes unicode', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(undefined), []);
});
