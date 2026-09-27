import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/outbound.mjs', import.meta.url));

function run(args, { cwd } = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', cwd });
}

function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'outbound-test-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'outbound test']);
  return dir;
}

test('--help exits 0 and prints usage', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test('unknown option exits 2', () => {
  const r = run(['--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});

test('missing value exits 2', () => {
  const r = run(['--repo']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing value/);
});

test('doctor --json fails on an unconfigured repo', () => {
  const dir = tempRepo();
  try {
    const r = run(['doctor', '--json', '--repo', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.checks.some((c) => c.name === 'git-repo' && c.ok === true));
    assert.ok(parsed.checks.some((c) => c.name === 'release-config' && c.ok === false));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor --json fails outside a git repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'outbound-nogit-'));
  try {
    const r = run(['doctor', '--json', '--repo', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.checks.some((c) => c.name === 'git-repo' && c.ok === false));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init writes a release config, then refuses to overwrite', () => {
  const dir = tempRepo();
  try {
    const first = run(['init', '--repo', dir]);
    assert.equal(first.status, 0);
    assert.match(first.stdout, /wrote \.github\/release\.yml/);
    const path = join(dir, '.github/release.yml');
    assert.equal(existsSync(path), true);
    const original = readFileSync(path, 'utf8');

    writeFileSync(path, '# hand edited\n');
    const second = run(['init', '--repo', dir]);
    assert.equal(second.status, 0);
    assert.match(second.stdout, /already exists/);
    assert.equal(readFileSync(path, 'utf8'), '# hand edited\n');

    const third = run(['init', '--repo', dir, '--force']);
    assert.equal(third.status, 0);
    assert.equal(readFileSync(path, 'utf8'), original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor --json passes once config and release workflow exist', () => {
  const dir = tempRepo();
  try {
    run(['init', '--repo', dir]);
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(
      join(wf, 'release.yml'),
      'on:\n  push:\n    branches: [main]\npermissions:\n  contents: write\njobs:\n  release:\n    steps:\n      - run: gh release create "$TAG" --generate-notes\n',
    );
    const r = run(['doctor', '--json', '--repo', dir]);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.checks.some((c) => c.name === 'release-config' && c.ok === true));
    assert.ok(parsed.checks.some((c) => c.name === 'release-workflow' && c.ok === true));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor from a subdirectory resolves to the git root', () => {
  const dir = tempRepo();
  try {
    run(['init', '--repo', dir]);
    const sub = join(dir, 'packages/app');
    mkdirSync(sub, { recursive: true });
    const r = run(['doctor', '--json'], { cwd: sub });
    const parsed = JSON.parse(r.stdout);
    assert.equal(realpathSync(parsed.dir), realpathSync(dir));
    assert.ok(parsed.checks.some((c) => c.name === 'release-config' && c.ok === true));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function validWorkflow(dir) {
  const wf = join(dir, '.github/workflows');
  mkdirSync(wf, { recursive: true });
  writeFileSync(
    join(wf, 'release.yml'),
    'on:\n  push:\n    branches: [main]\npermissions:\n  contents: write\njobs:\n  release:\n    steps:\n      - run: gh release create "$TAG" --generate-notes\n',
  );
}

test('doctor fails when release.yml is structurally invalid', () => {
  const dir = tempRepo();
  try {
    run(['init', '--repo', dir]);
    validWorkflow(dir);
    writeFileSync(
      join(dir, '.github/release.yml'),
      'changelog:\n  categories:\n    - title: Features\n      labels: [enhancement]\n',
    );
    const r = run(['doctor', '--json', '--repo', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    const check = parsed.checks.find((c) => c.name === 'release-config-valid');
    assert.equal(check.ok, false);
    assert.match(check.hint, /catch-all/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor fails when the release workflow cannot write contents', () => {
  const dir = tempRepo();
  try {
    run(['init', '--repo', dir]);
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(
      join(wf, 'release.yml'),
      'on:\n  push:\n    branches: [main]\njobs:\n  release:\n    steps:\n      - run: gh release create "$TAG" --generate-notes\n',
    );
    const r = run(['doctor', '--json', '--repo', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    const check = parsed.checks.find((c) => c.name === 'release-workflow-write');
    assert.equal(check.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--no-remote skips every gh-based check', () => {
  const dir = tempRepo();
  try {
    run(['init', '--repo', dir]);
    validWorkflow(dir);
    const r = run(['doctor', '--json', '--no-remote', '--repo', dir]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    for (const name of ['release-labels', 'pr-titles', 'pr-only']) {
      const check = parsed.checks.find((c) => c.name === name);
      assert.equal(check.skipped, true, `${name} should be skipped`);
      assert.match(check.detail, /--no-remote/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
