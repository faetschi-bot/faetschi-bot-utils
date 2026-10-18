import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MIN_CACHED_ASSET_BYTES, usableCachedAsset } from '../lib/shared.mjs';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'visual-shot-assets-'));
}

const sha = (text) => createHash('sha256').update(text).digest('hex');
const body = 'x'.repeat(MIN_CACHED_ASSET_BYTES + 10);

test('usableCachedAsset verifies once and trusts the sidecar across runs', () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'asset.js');
    writeFileSync(file, body);
    assert.equal(usableCachedAsset(file, sha(body)), true);
    assert.equal(existsSync(`${file}.verified`), true);
    // The sidecar carries the (size, mtime) memo, so an unchanged file is not
    // re-hashed even when a different digest is expected.
    assert.equal(usableCachedAsset(file, sha('other')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usableCachedAsset invalidates on change and re-hashes', () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'asset.js');
    writeFileSync(file, body);
    assert.equal(usableCachedAsset(file, sha(body)), true);
    writeFileSync(file, `${body}changed`);
    assert.equal(usableCachedAsset(file, sha(body)), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usableCachedAsset removes the sidecar when the digest fails', () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'asset.js');
    writeFileSync(file, body);
    assert.equal(usableCachedAsset(file, sha('nope')), false);
    assert.equal(existsSync(`${file}.verified`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usableCachedAsset still enforces the size floor', () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'small.js');
    writeFileSync(file, 'tiny');
    assert.equal(usableCachedAsset(file, sha('tiny')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
