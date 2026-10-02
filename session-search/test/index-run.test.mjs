import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIndexDocs, readIndexMeta } from '../lib/core/cache.mjs';
import { inScope, indexPi, persistIndex } from '../lib/index-run.mjs';

function writeSession(root, id, cwd, lines) {
  const dir = join(root, `--${cwd.replace(/\//g, '-')}--`);
  mkdirSync(dir, { recursive: true });
  const body = [`{"type":"session","version":3,"id":"${id}","cwd":"${cwd}"}`, ...lines].join('\n');
  writeFileSync(join(dir, `${id}.jsonl`), body);
}

test('inScope matches the project directory and its children, not siblings', () => {
  assert.equal(inScope('/a/b', '/a/b', 'project'), true);
  assert.equal(inScope('/a/b/c', '/a/b', 'project'), true);
  assert.equal(inScope('/a/bc', '/a/b', 'project'), false);
  assert.equal(inScope('/elsewhere', '/a/b', 'project'), false);
  assert.equal(inScope('/elsewhere', '/a/b', 'all'), true);
});

test('indexPi extracts in-scope sessions, redacts, and persists a readable cache', () => {
  const base = mkdtempSync(join(tmpdir(), 'session-search-index-'));
  const sessionsRoot = join(base, 'sessions');
  const cacheRoot = join(base, 'cache');
  try {
    writeSession(sessionsRoot, 's1', '/p', [
      '{"type":"message","id":"e1","timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"user","content":"use token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345","timestamp":1}}',
    ]);
    writeSession(sessionsRoot, 's2', '/other', [
      '{"type":"message","id":"e2","message":{"role":"user","content":"other project","timestamp":2}}',
    ]);

    const built = indexPi({ sessionsRoot, cacheRoot, scope: 'project', project: '/p' });
    assert.equal(built.meta.sessions, 1);
    assert.equal(built.turns.length, 1);
    assert.equal(built.turns[0].text.includes('ghp_'), false);

    const result = persistIndex(built);
    assert.equal(result.skipped, false);
    const docs = readIndexDocs(built.dir);
    assert.equal(docs.length, 1);
    assert.equal(JSON.stringify(docs).includes('ghp_'), false);
    assert.equal(readIndexMeta(built.dir).sessions, 1);

    const again = persistIndex(indexPi({ sessionsRoot, cacheRoot, scope: 'project', project: '/p' }));
    assert.equal(again.skipped, true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
