import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RECAP_ANNOTATION_LINES, MAX_RECAP_BLOCKS } from '../lib/config.mjs';
import { validateRecap } from '../lib/recap/schema.mjs';

// --- schema -----------------------------------------------------------------

test('validateRecap accepts a minimal valid recap', () => {
  const result = validateRecap({
    version: 1,
    title: 'T',
    blocks: [{ type: 'notes', markdown: 'hi' }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateRecap rejects unknown block types and missing required fields', () => {
  const result = validateRecap({
    version: 1,
    title: 'T',
    blocks: [
      { type: 'nope' },
      { type: 'diff', before: 'a' },
      { type: 'file-tree', entries: [] },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('blocks[0].type "nope"')));
  assert.ok(result.errors.some((e) => e.includes('blocks[1].after')));
  assert.ok(result.errors.some((e) => e.includes('blocks[2].entries')));
});

test('validateRecap descends into columns and tabs blocks', () => {
  const result = validateRecap({
    version: 1,
    title: 'T',
    blocks: [{ type: 'tabs', tabs: [{ label: 'a', blocks: [{ type: 'callout' }] }] }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('blocks[0].tabs[0].blocks[0].body')));
});

test('validateRecap rejects a recap nested beyond the depth limit without throwing', () => {
  // Build columns nested far past the guard so recursion would otherwise
  // overflow the call stack; expect a normal validation error, not a RangeError.
  let block = { type: 'notes', markdown: 'leaf' };
  for (let i = 0; i < 40; i++) {
    block = { type: 'columns', columns: [{ blocks: [block] }] };
  }
  const result = validateRecap({ version: 1, title: 'T', blocks: [block] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('exceeds maximum nesting depth')));
});

test('validateRecap requires a title and a non-empty blocks array', () => {
  assert.equal(validateRecap({ version: 1, blocks: [] }).ok, false);
  assert.equal(validateRecap({ version: 1, title: 'T', blocks: [] }).ok, false);
  assert.ok(validateRecap({ version: 1, title: 'T' }).errors.includes('blocks must be a non-empty array'));
});

// --- validation limits ------------------------------------------------------

test('validateRecap rejects out-of-enum values and oversized annotations/blocks', () => {
  const base = (blocks) => ({ version: 1, title: 'T', blocks });

  const badChange = validateRecap(base([{ type: 'file-tree', entries: [{ path: 'a', change: 'bogus' }] }]));
  assert.equal(badChange.ok, false);
  assert.ok(badChange.errors.some((e) => e.includes('change must be one of')));

  const badTone = validateRecap(base([{ type: 'callout', body: 'x', tone: 'loud' }]));
  assert.equal(badTone.ok, false);
  assert.ok(badTone.errors.some((e) => e.includes('tone must be one of')));

  const badMode = validateRecap(base([{ type: 'diff', before: '', after: '', mode: 'sideways' }]));
  assert.equal(badMode.ok, false);
  assert.ok(badMode.errors.some((e) => e.includes('mode must be')));

  const badSide = validateRecap(base([{
    type: 'diff',
    before: '',
    after: '',
    annotations: [{ lines: '1', side: 'middle' }],
  }]));
  assert.equal(badSide.ok, false);
  assert.ok(badSide.errors.some((e) => e.includes('side must be')));

  const tooManyLines = validateRecap(base([{
    type: 'diff',
    before: '',
    after: '',
    annotations: [{ lines: `1-${MAX_RECAP_ANNOTATION_LINES + 1}` }],
  }]));
  assert.equal(tooManyLines.ok, false);
  assert.ok(tooManyLines.errors.some((e) => e.includes('exceeds')));

  const tooManyBlocks = validateRecap(base(
    Array.from({ length: MAX_RECAP_BLOCKS + 1 }, () => ({ type: 'notes', markdown: 'x' })),
  ));
  assert.equal(tooManyBlocks.ok, false);
  assert.ok(tooManyBlocks.errors.some((e) => e.includes('at most')));
});
