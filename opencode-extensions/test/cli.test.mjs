import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/opencode-extensions.mjs', import.meta.url));
const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...options });
}

// An empty PATH keeps the tests from ever finding or running a real installer.
const emptyPath = { ...process.env, PATH: '' };

test('--help exits 0 and prints usage', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});

test('--version prints a semver', () => {
  const result = run(['--version']);
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('unknown option exits 2', () => {
  const result = run(['--nope']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option/);
});

test('list --json includes the curated extensions', () => {
  const result = run(['list', '--json', '--root', packageRoot]);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  const codex = parsed.extensions.find((entry) => entry.name === 'codex-multi-auth');
  assert.ok(codex);
  assert.equal(codex.installer, 'opencode');
  assert.equal(codex.spec, 'oc-codex-multi-auth@latest');
  const plannotator = parsed.extensions.find((entry) => entry.name === 'plannotator');
  assert.equal(plannotator.installer, 'opencode');
  assert.equal(plannotator.spec, '@plannotator/opencode@latest');
});

test('doctor --json validates the packaged catalog', () => {
  const result = run(['doctor', '--json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.errors.join('; '));
  assert.ok(parsed.extensions.some((entry) => entry.name === 'codex-multi-auth'));
  assert.ok('opencode' in parsed.installers);
});

test('doctor fails on an invalid catalog', () => {
  const result = run(['doctor', '--json', '--root', '/nonexistent-catalog-root']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /cannot read catalog/);
});

test('install --dry-run prints the installer command and installs nothing', () => {
  const result = run(['install', '--all', '--dry-run', '--json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.dryRun, true);
  assert.deepEqual(parsed.steps[0].command, ['opencode', 'plugin', 'add', 'oc-codex-multi-auth@latest']);
});

test('install --dry-run works with no installer on PATH', () => {
  const result = run(['install', '--all', '--dry-run', '--json'], { env: emptyPath });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.steps.length, 2);
});

test('install --json captures installer output as one JSON document', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opencode-extensions-fake-'));
  const fake = join(dir, 'opencode');
  writeFileSync(fake, '#!/bin/sh\necho "fake opencode stdout"\necho "fake opencode stderr" >&2\nexit 0\n');
  chmodSync(fake, 0o755);
  try {
    const result = run(['install', 'plannotator', '--json'], { env: { ...process.env, PATH: dir } });
    assert.equal(result.status, 0, result.stderr);
    // JSON.parse throws if the child's stdout leaked into the result document.
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.results[0].ok, true);
    assert.match(parsed.results[0].stdout, /fake opencode stdout/);
    assert.match(parsed.results[0].stderr, /fake opencode stderr/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('install --json reports steps not attempted after a failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opencode-extensions-fail-'));
  const fake = join(dir, 'opencode');
  writeFileSync(fake, '#!/bin/sh\necho "boom" >&2\nexit 3\n');
  chmodSync(fake, 0o755);
  const catalogDir = mkdtempSync(join(tmpdir(), 'opencode-extensions-catalog-'));
  writeFileSync(
    join(catalogDir, 'catalog.json'),
    JSON.stringify({
      extensions: [
        { name: 'first', summary: 'x', installer: 'opencode', spec: '@example/first@latest', homepage: 'https://example.test/first', license: 'MIT' },
        { name: 'second', summary: 'y', installer: 'opencode', spec: '@example/second@latest', homepage: 'https://example.test/second', license: 'MIT' },
      ],
    }),
  );
  try {
    const result = run(['install', '--all', '--json', '--root', catalogDir], {
      env: { ...process.env, PATH: dir },
    });
    assert.equal(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, false);
    assert.deepEqual(parsed.results.map((entry) => entry.extension), ['first']);
    assert.deepEqual(parsed.notAttempted.map((entry) => entry.extension), ['second']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(catalogDir, { recursive: true, force: true });
  }
});

test('install rejects an unknown extension', () => {
  const result = run(['install', 'nope']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown extension/);
});

test('install fails clearly when the installer is missing', () => {
  const result = run(['install', 'codex-multi-auth'], { env: emptyPath });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not found on PATH/);
});
