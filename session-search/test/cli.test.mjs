import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

test('--help prints usage and exits 0', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /session-search index/);
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
