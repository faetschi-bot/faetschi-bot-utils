import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/agentic-tools.mjs', import.meta.url));
const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
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
