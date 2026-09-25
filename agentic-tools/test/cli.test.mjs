import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/agentic-tools.mjs', import.meta.url));
const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...options });
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'agentic-tools-test-'));
}

function tempRoot(skillBody) {
  const dir = mkdtempSync(join(tmpdir(), 'agentic-tools-test-'));
  const skillDir = join(dir, 'skills', 'sample');
  mkdirSync(skillDir, { recursive: true });
  if (skillBody !== undefined) writeFileSync(join(skillDir, 'SKILL.md'), skillBody);
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
  const r = run(['--root']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing value/);
});

test('doctor --json validates the packaged test-audit skill', () => {
  const r = run(['doctor', '--json', '--root', packageRoot]);
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.skills.map((s) => s.name), ['test-audit']);
});

test('list prints the packaged skill', () => {
  const r = run(['list', '--root', packageRoot]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /test-audit/);
});

test('doctor fails on a skill missing a description', () => {
  const dir = tempRoot('---\nname: sample\n---\n\n# Sample\n');
  try {
    const r = run(['doctor', '--json', '--root', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.skills[0].errors.some((e) => /missing "description"/.test(e)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor fails on a name that does not match its directory', () => {
  const dir = tempRoot('---\nname: other\ndescription: "x"\n---\n\n# Other\n');
  try {
    const r = run(['doctor', '--json', '--root', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.skills[0].errors.some((e) => /does not match directory/.test(e)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor fails on a broken relative link', () => {
  const dir = tempRoot('---\nname: sample\ndescription: "x"\n---\n\nSee [helper](helper.md).\n');
  try {
    const r = run(['doctor', '--json', '--root', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.skills[0].errors.some((e) => /broken relative link/.test(e)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor fails on a broken in-page anchor', () => {
  const dir = tempRoot('---\nname: sample\ndescription: "x"\n---\n\n# Sample\n\nSee [nope](#missing).\n');
  try {
    const r = run(['doctor', '--json', '--root', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.skills[0].errors.some((e) => /broken anchor: #missing/.test(e)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor accepts a valid in-page anchor', () => {
  const dir = tempRoot('---\nname: sample\ndescription: "x"\n---\n\n# Sample\n\n## Details\n\nSee [details](#details).\n');
  try {
    const r = run(['doctor', '--json', '--root', dir]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('install copies the packaged skill into --dir', () => {
  const dest = tempDir();
  try {
    const r = run(['install', 'test-audit', '--dir', dest, '--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.installed[0].name, 'test-audit');
    assert.equal(parsed.installed[0].action, 'create');
    assert.ok(existsSync(join(dest, 'test-audit', 'SKILL.md')));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install refuses to overwrite without --force', () => {
  const dest = tempDir();
  try {
    assert.equal(run(['install', 'test-audit', '--dir', dest]).status, 0);
    const again = run(['install', 'test-audit', '--dir', dest]);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists/);
    const forced = run(['install', 'test-audit', '--dir', dest, '--force', '--json']);
    assert.equal(forced.status, 0);
    assert.equal(JSON.parse(forced.stdout).installed[0].action, 'overwrite');
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install --dry-run writes nothing', () => {
  const dest = tempDir();
  try {
    const r = run(['install', '--all', '--dir', dest, '--dry-run', '--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.installed[0].action, 'create');
    assert.equal(existsSync(join(dest, 'test-audit')), false);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install rejects an unknown skill', () => {
  const dest = tempDir();
  try {
    const r = run(['install', 'nope', '--dir', dest]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Unknown skill/);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install rejects --all combined with skill names', () => {
  const r = run(['install', '--all', 'test-audit']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Cannot combine --all/);
});

test('install defaults to the project opencode skills dir', () => {
  const cwd = tempDir();
  try {
    const r = run(['install', 'test-audit', '--target', 'opencode'], { cwd });
    assert.equal(r.status, 0);
    assert.ok(existsSync(join(cwd, '.opencode', 'skills', 'test-audit', 'SKILL.md')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('install --global writes to the home config for the target', () => {
  const home = tempDir();
  try {
    const r = run(['install', 'test-audit', '--target', 'opencode', '--global'], {
      env: { ...process.env, HOME: home },
    });
    assert.equal(r.status, 0);
    assert.ok(existsSync(join(home, '.config', 'opencode', 'skills', 'test-audit', 'SKILL.md')));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
