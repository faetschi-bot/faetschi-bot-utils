import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CACHE_SCHEMA_VERSION,
  fingerprintFromParts,
  isFresh,
  readIndexDocs,
  readIndexMeta,
  resolveCacheRoot,
  writeIndex,
} from '../lib/core/cache.mjs';

test('resolveCacheRoot honors the override and platform defaults', () => {
  assert.equal(resolveCacheRoot({ env: { SESSION_SEARCH_CACHE: '/x' }, platform: 'linux', home: '/h' }), '/x');
  assert.equal(resolveCacheRoot({ env: {}, platform: 'linux', home: '/h' }), join('/h', '.cache', 'session-search'));
  assert.equal(resolveCacheRoot({ env: {}, platform: 'darwin', home: '/h' }), join('/h', 'Library', 'Caches', 'session-search'));
});

test('fingerprint ignores part order', () => {
  assert.equal(fingerprintFromParts(['b', 'a']), fingerprintFromParts(['a', 'b']));
});

test('writeIndex round-trips meta and docs and drives freshness', () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-search-cache-'));
  try {
    const meta = { schemaVersion: CACHE_SCHEMA_VERSION, fingerprint: 'fp', turns: 1 };
    writeIndex(dir, { meta, turns: [{ v: 1, text: 'x' }] });
    assert.deepEqual(readIndexMeta(dir), meta);
    assert.deepEqual(readIndexDocs(dir), [{ v: 1, text: 'x' }]);
    assert.equal(isFresh(readIndexMeta(dir), 'fp'), true);
    assert.equal(isFresh(readIndexMeta(dir), 'other'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
