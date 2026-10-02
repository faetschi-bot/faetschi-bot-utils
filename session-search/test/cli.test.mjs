import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/session-search.mjs', import.meta.url));

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...options });
}

function isolatedEnv() {
  const home = mkdtempSync(join(tmpdir(), 'session-search-cli-'));
  return {
    home,
    env: {
      ...process.env,
      HOME: home,
      XDG_STATE_HOME: join(home, 'state'),
      XDG_CACHE_HOME: join(home, 'cache'),
      PI_CODING_AGENT_SESSION_DIR: join(home, 'pi-sessions'),
    },
  };
}

function writePiSession(root, cwd) {
  const dir = join(root, `--${cwd.replace(/\//g, '-')}--`);
  mkdirSync(dir, { recursive: true });
  const lines = [
    `{"type":"session","version":3,"id":"s1","cwd":"${cwd}"}`,
    '{"type":"session_info","id":"n1","name":"Rate limiter work"}',
    '{"type":"message","id":"e1","timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"user","content":"add a rate limiter to the API client","timestamp":1}}',
  ];
  writeFileSync(join(dir, 's1.jsonl'), lines.join('\n'));
}

test('--help prints usage and exits 0', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /session-search search/);
});

test('--version prints the package version', () => {
  const result = run(['--version']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '0.1.0');
});

test('unknown option exits 2', () => {
  const result = run(['--nope']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option/);
});

test('doctor --json is ok with no harness present', () => {
  const { home, env } = isolatedEnv();
  try {
    const result = run(['doctor', '--json'], { env });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    const byName = Object.fromEntries(parsed.checks.map((check) => [check.name, check.status]));
    assert.equal(byName.node, 'ok');
    assert.equal(byName.cache, 'ok');
    assert.equal(byName['opencode-source'], 'skip');
    assert.equal(byName['pi-source'], 'skip');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('index then search and show work end to end', () => {
  const base = mkdtempSync(join(tmpdir(), 'session-search-e2e-'));
  const sessionsRoot = join(base, 'sessions');
  const cache = join(base, 'cache');
  try {
    writePiSession(sessionsRoot, '/p');
    const common = ['--harness', 'pi', '--project', '/p', '--pi-sessions', sessionsRoot, '--cache', cache];

    const indexed = run(['index', ...common, '--json']);
    assert.equal(indexed.status, 0, indexed.stderr);
    assert.equal(JSON.parse(indexed.stdout).results[0].turns, 1);

    const searched = run(['search', 'rate limiter', ...common, '--json']);
    assert.equal(searched.status, 0, searched.stderr);
    const found = JSON.parse(searched.stdout).results;
    assert.equal(found[0].session, 's1');
    assert.equal(found[0].title, 'Rate limiter work');

    const shown = run(['show', 's1', ...common]);
    assert.equal(shown.status, 0, shown.stderr);
    assert.match(shown.stdout, /rate limiter to the API client/);

    const missing = run(['search', 'anything', '--harness', 'pi', '--project', '/none', '--cache', cache]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /no index/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
