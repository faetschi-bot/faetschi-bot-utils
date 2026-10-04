import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/pi-extensions.mjs', import.meta.url));
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

test('list --json includes you-should-know for both harnesses', () => {
  const result = run(['list', '--json', '--root', packageRoot]);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  const extension = parsed.extensions.find((entry) => entry.name === 'you-should-know');
  assert.ok(extension);
  assert.deepEqual(Object.keys(extension.sources).sort(), ['omp', 'pi']);
  assert.equal(extension.sources.pi.spec, 'git:github.com/aliceisjustplaying/pi-you-should-know');
  assert.equal(extension.sources.omp.spec, 'github:ubranch/omp-you-should-know');
});

test('list --harness pi narrows sources to pi', () => {
  const result = run(['list', '--json', '--harness', 'pi']);
  assert.equal(result.status, 0);
  const extension = JSON.parse(result.stdout).extensions.find((entry) => entry.name === 'you-should-know');
  assert.deepEqual(Object.keys(extension.sources), ['pi']);
});

test('doctor --json validates the packaged catalog', () => {
  const result = run(['doctor', '--json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.errors.join('; '));
  assert.ok(parsed.extensions.some((entry) => entry.name === 'you-should-know'));
  assert.ok('pi' in parsed.harnesses && 'omp' in parsed.harnesses);
});

test('doctor fails on an invalid catalog', () => {
  const result = run(['doctor', '--json', '--root', '/nonexistent-catalog-root']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /cannot read catalog/);
});

test('install --dry-run prints the native command and installs nothing', () => {
  const result = run(['install', '--all', '--harness', 'pi', '--dry-run', '--json']);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.dryRun, true);
  assert.deepEqual(parsed.steps[0].command, ['pi', 'install', 'git:github.com/aliceisjustplaying/pi-you-should-know']);
});

test('install --dry-run with auto previews both when no harness is on PATH', () => {
  const result = run(['install', '--all', '--dry-run', '--json'], { env: emptyPath });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.harnesses, ['pi', 'omp']);
  assert.equal(parsed.steps.length, 2);
});

test('install --local with omp exits 2', () => {
  const result = run(['install', 'you-should-know', '--harness', 'omp', '--local']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--local is not supported/);
});

test('install rejects an unknown extension', () => {
  const result = run(['install', 'nope', '--harness', 'pi']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown extension/);
});

test('install fails clearly when the named harness CLI is missing', () => {
  const result = run(['install', '--all', '--harness', 'pi'], { env: emptyPath });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CLI not found on PATH/);
});

test('install --harness auto fails clearly when no harness is on PATH', () => {
  const result = run(['install', '--all'], { env: emptyPath });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no supported harness found/);
});

test('install --local and --global together exit 2', () => {
  const result = run(['install', '--all', '--local', '--global']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Cannot combine --local with --global/);
});
