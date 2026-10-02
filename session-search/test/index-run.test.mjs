import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIndexDocs, readIndexMeta } from '../lib/core/cache.mjs';
import { inScope, indexOpencode, indexPi, loadPrevious, persistIndex } from '../lib/index-run.mjs';
import { readPiSession } from '../lib/sources/pi.mjs';

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

test('indexPi reuses unchanged files instead of re-parsing them', () => {
  const base = mkdtempSync(join(tmpdir(), 'session-search-incremental-'));
  const sessionsRoot = join(base, 'sessions');
  const cacheRoot = join(base, 'cache');
  try {
    writeSession(sessionsRoot, 's1', '/p', [
      '{"type":"message","id":"e1","message":{"role":"user","content":"hello","timestamp":1}}',
    ]);
    let parses = 0;
    const readSession = (file) => {
      parses += 1;
      return readPiSession(file);
    };
    const first = indexPi({ sessionsRoot, cacheRoot, scope: 'project', project: '/p', readSession });
    persistIndex(first);
    parses = 0;
    const previous = loadPrevious(first.dir, true);
    const second = indexPi({ sessionsRoot, cacheRoot, scope: 'project', project: '/p', previous, readSession });
    assert.equal(parses, 0);
    assert.equal(second.turns.length, first.turns.length);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('indexOpencode skips fetching messages for unchanged sessions', async () => {
  const base = mkdtempSync(join(tmpdir(), 'session-search-incremental-'));
  const cacheRoot = join(base, 'cache');
  const sessions = [{ id: 's1', parentID: null, title: 't', location: { directory: '/p' }, time: { created: 1, updated: 10 } }];
  let fetches = 0;
  const client = {
    listSessions: async () => sessions,
    listMessages: async () => {
      fetches += 1;
      return [{ type: 'user', id: 'm1', time: { created: 1 }, text: 'hello' }];
    },
  };
  try {
    const first = await indexOpencode({ client, cacheRoot, scope: 'project', project: '/p' });
    persistIndex(first);
    assert.equal(fetches, 1);
    fetches = 0;
    const previous = loadPrevious(first.dir, true);
    const second = await indexOpencode({ client, cacheRoot, scope: 'project', project: '/p', previous });
    assert.equal(fetches, 0);
    assert.equal(second.turns.length, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
