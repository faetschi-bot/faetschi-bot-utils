import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleRecap } from '../lib/recap/assemble.mjs';

// --- assemble ---------------------------------------------------------------

test('assembleRecap adds a file map and inline patches from a git diff', () => {
  const gitData = {
    entries: [{ path: 'a.ts', change: 'modified' }],
    patches: new Map([['a.ts', 'diff --git a/a.ts b/a.ts\n+new\n']]),
    total: 1,
    truncated: false,
  };
  const { recap } = assembleRecap({ range: 'main...HEAD', gitData });
  assert.equal(recap.blocks[0].type, 'file-tree');
  assert.equal(recap.blocks[0].entries[0].path, 'a.ts');
  assert.equal(recap.blocks[1].type, 'tabs');
  assert.equal(recap.blocks[1].tabs[0].blocks[0].type, 'patch');
});

test('assembleRecap does not duplicate an author-provided file tree', () => {
  const gitData = {
    entries: [{ path: 'a.ts', change: 'modified' }],
    patches: new Map(),
    total: 1,
    truncated: false,
  };
  const { recap } = assembleRecap({
    from: { version: 1, title: 'T', blocks: [{ type: 'file-tree', entries: [{ path: 'x', change: 'added' }] }] },
    gitData,
  });
  assert.equal(recap.blocks.filter((b) => b.type === 'file-tree').length, 1);
  assert.equal(recap.blocks[0].entries[0].path, 'x');
});

test('assembleRecap warns when patches are truncated', () => {
  const gitData = {
    entries: [],
    patches: new Map([['a.ts', 'x']]),
    total: 40,
    truncated: true,
  };
  const { warnings } = assembleRecap({ range: 'x', gitData });
  assert.ok(warnings.some((w) => w.includes('limited to 1 of 40')));
});

test('assembleRecap lets --title override --from and warns on an empty diff', () => {
  const from = { version: 1, title: 'Original', blocks: [{ type: 'notes', markdown: 'x' }] };
  const overridden = assembleRecap({ from, title: 'From CLI' });
  assert.equal(overridden.recap.title, 'From CLI');

  const empty = assembleRecap({
    range: 'main...HEAD',
    gitData: { entries: [], patches: new Map(), total: 0, truncated: false },
  });
  assert.ok(empty.warnings.some((w) => w.includes('no changes')));
  assert.equal(empty.recap.blocks.some((b) => b.type === 'file-tree' || b.type === 'tabs'), false);
});
