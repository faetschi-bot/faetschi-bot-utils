import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexPi, persistIndex } from '../lib/index-run.mjs';
import { historySearchOutputSchema, historyShowOutputSchema } from '../lib/mcp-server.mjs';

const bin = fileURLToPath(new URL('../bin/session-search.mjs', import.meta.url));
const OPENCODE_KEY = 'ai.opencode/sessionID';

function writePiSession(root, cwd) {
  const dir = join(root, `--${cwd.replace(/\//g, '-')}--`);
  mkdirSync(dir, { recursive: true });
  const lines = [
    `{"type":"session","version":3,"id":"s1","cwd":"${cwd}"}`,
    '{"type":"message","id":"e1","timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"user","content":"add a rate limiter to the API client","timestamp":1}}',
  ];
  writeFileSync(join(dir, 's1.jsonl'), lines.join('\n'));
}

function startServer({ cwd, env }) {
  const child = spawn(process.execPath, [bin, 'mcp'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  const waiters = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      waiters.get(message.id)?.(message);
      waiters.delete(message.id);
    }
  });
  let nextId = 1;
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiters.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, (error) => (error ? reject(error) : null));
    });
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  const stop = () =>
    new Promise((resolve) => {
      child.once('exit', resolve);
      child.stdin.end();
      child.kill('SIGTERM');
    });
  return { request, notify, stop };
}

test('MCP server lists tools, reads _meta for project scope, and shows a session', async () => {
  const base = mkdtempSync(join(tmpdir(), 'session-search-mcp-'));
  const project = join(base, 'project');
  const elsewhere = join(base, 'elsewhere');
  mkdirSync(project, { recursive: true });
  mkdirSync(elsewhere, { recursive: true });
  const sessionsRoot = join(base, 'sessions');
  const cache = join(base, 'cache');
  const server = startServer({ cwd: elsewhere, env: { ...process.env, SESSION_SEARCH_CACHE: cache } });
  try {
    writePiSession(sessionsRoot, project);
    persistIndex(indexPi({ sessionsRoot, cacheRoot: cache, scope: 'project', project }));

    await server.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    server.notify('notifications/initialized');

    const list = await server.request('tools/list', {});
    assert.deepEqual(list.result.tools.map((tool) => tool.name).sort(), ['history_search', 'history_show']);

    // cwd is elsewhere; only the _meta session id can resolve the project.
    const withoutMeta = await server.request('tools/call', { name: 'history_search', arguments: { query: 'rate limiter' } });
    assert.equal(withoutMeta.result.isError, true);

    const withMeta = await server.request('tools/call', {
      name: 'history_search',
      arguments: { query: 'rate limiter' },
      _meta: { [OPENCODE_KEY]: 's1' },
    });
    assert.equal(withMeta.result.isError ?? false, false);
    historySearchOutputSchema.parse(withMeta.result.structuredContent);
    assert.equal(withMeta.result.structuredContent.hits[0].session, 's1');

    const shown = await server.request('tools/call', { name: 'history_show', arguments: { session: 's1' } });
    historyShowOutputSchema.parse(shown.result.structuredContent);
    assert.equal(shown.result.structuredContent.count, 1);
  } finally {
    await server.stop();
    rmSync(base, { recursive: true, force: true });
  }
});
