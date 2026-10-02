import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adapterTarget, installAdapter, installSkill, mcpConfigSnippet, renderAdapter, skillTarget } from '../lib/install.mjs';

test('renderAdapter substitutes the CLI path and leaves no placeholder', () => {
  const source = renderAdapter('opencode', { cliPath: '/x/bin/session-search.mjs', nodePath: '/usr/bin/node' });
  assert.match(source, /\/x\/bin\/session-search\.mjs/);
  assert.match(source, /\/usr\/bin\/node/);
  assert.equal(source.includes('__SESSION_SEARCH_BIN__'), false);
  assert.equal(source.includes('__SESSION_SEARCH_NODE__'), false);
});

test('the generated OpenCode adapter is valid JavaScript', () => {
  const base = mkdtempSync(join(tmpdir(), 'session-search-install-'));
  try {
    const file = join(base, 'plugin.mjs');
    writeFileSync(file, renderAdapter('opencode', { cliPath: process.execPath }));
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('installAdapter writes project targets, bakes the cache, and refuses overwrite', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'session-search-install-'));
  try {
    const first = installAdapter('opencode', { cwd, cacheRoot: '/custom-cache' });
    assert.equal(first.action, 'create');
    assert.ok(existsSync(join(cwd, '.opencode', 'plugins', 'session-search.js')));
    assert.match(readFileSync(first.path, 'utf8'), /\/custom-cache/);
    assert.throws(() => installAdapter('opencode', { cwd }), /already exists/);
    assert.equal(installAdapter('opencode', { cwd, force: true }).action, 'overwrite');
    assert.ok(existsSync(installAdapter('pi', { cwd }).path));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('adapterTarget honors the global location', () => {
  const home = mkdtempSync(join(tmpdir(), 'session-search-install-'));
  try {
    assert.equal(
      adapterTarget('opencode', { global: true, home }),
      join(home, '.config', 'opencode', 'plugins', 'session-search.js'),
    );
    assert.equal(adapterTarget('pi', { global: true, home }), join(home, '.pi', 'agent', 'extensions', 'session-search.ts'));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('mcpConfigSnippet shapes per harness', () => {
  assert.ok(mcpConfigSnippet('opencode').mcp.servers.session_search.command);
  assert.ok(mcpConfigSnippet('pi').mcpServers.session_search.args);
});

test('installSkill copies the packaged skill and refuses overwrite', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'session-search-install-'));
  try {
    const first = installSkill('opencode', { cwd });
    assert.equal(first.skill, 'session-search');
    assert.ok(existsSync(join(cwd, '.opencode', 'skills', 'session-search', 'SKILL.md')));
    assert.throws(() => installSkill('opencode', { cwd }), /already exists/);
    assert.ok(existsSync(installSkill('pi', { cwd }).path));
    assert.ok(existsSync(join(cwd, '.pi', 'skills', 'session-search', 'SKILL.md')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('skillTarget honors the global location', () => {
  const home = mkdtempSync(join(tmpdir(), 'session-search-install-'));
  try {
    assert.equal(
      skillTarget('opencode', { global: true, home }),
      join(home, '.config', 'opencode', 'skills', 'session-search'),
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
