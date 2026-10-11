import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('doctor --json validates the packaged skills', () => {
  const r = run(['doctor', '--json', '--root', packageRoot]);
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  // Assert every packaged skill validates and the known skills survive, without
  // pinning the exact inventory (adding a skill should not break this test).
  assert.ok(parsed.skills.every((s) => s.ok));
  const names = parsed.skills.map((s) => s.name);
  for (const expected of ['agent-friendly-code', 'test-audit', 'visual-recap']) {
    assert.ok(names.includes(expected), `expected packaged skill ${expected}`);
  }
});

test('list prints the packaged skills', () => {
  const r = run(['list', '--root', packageRoot]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /agent-friendly-code/);
  assert.match(r.stdout, /test-audit/);
  assert.match(r.stdout, /visual-recap/);
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
    assert.ok(parsed.installed.length > 0);
    assert.ok(parsed.installed.every((s) => s.action === 'create'));
    // The contract is "writes nothing": the destination stays empty.
    assert.deepEqual(readdirSync(dest), []);
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

test('doctor --json validates the packaged commands', () => {
  const r = run(['doctor', '--json', '--root', packageRoot]);
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  // Every packaged command must validate, and the known inventory must survive.
  assert.ok(parsed.commands.length > 0);
  assert.ok(parsed.commands.every((c) => c.ok));
  const names = parsed.commands.map((c) => c.name);
  for (const expected of ['catch-up', 'clean-codebase-loop', 'weigh']) {
    assert.ok(names.includes(expected), `expected packaged command ${expected}`);
  }
});

test('doctor fails on a command with an unresolved template variable', () => {
  const dir = tempDir();
  try {
    const commandFile = join(dir, 'commands', 'sample.md');
    mkdirSync(join(dir, 'commands'), { recursive: true });
    writeFileSync(commandFile, '---\ndescription: "x"\n---\n\nUse {{idea_block}}.\n');
    const r = run(['doctor', '--json', '--root', dir]);
    assert.equal(r.status, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.commands[0].errors.some((e) => /unresolved template variable/.test(e)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('list --commands prints the packaged commands', () => {
  const r = run(['list', '--commands', '--root', packageRoot]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /catch-up/);
  assert.match(r.stdout, /clean-codebase-loop/);
  const json = run(['list', '--commands', '--json', '--root', packageRoot]);
  assert.equal(json.status, 0);
  assert.ok(JSON.parse(json.stdout).commands.some((c) => c.name === 'weigh'));
});

test('install --commands writes an OpenCode command file', () => {
  const dest = tempDir();
  try {
    const r = run(['install', 'catch-up', '--commands', '--target', 'opencode', '--dir', dest, '--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.kind, 'commands');
    assert.equal(parsed.installed[0].name, 'catch-up');
    const file = join(dest, 'catch-up.md');
    assert.ok(existsSync(file));
    const text = readFileSync(file, 'utf8');
    // OpenCode reads description from frontmatter and the body as the template.
    assert.match(text, /^---\ndescription: "/);
    assert.match(text, /Catch me up on where this project is right now\./);
    // No placeholder syntax may leak: OpenCode appends typed arguments itself.
    assert.ok(!text.includes('$@'));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install --commands --target pi writes a prompt template with the argument trailer', () => {
  const dest = tempDir();
  try {
    const r = run(['install', 'craft-goal', '--commands', '--target', 'pi', '--dir', dest, '--json']);
    assert.equal(r.status, 0);
    const text = readFileSync(join(dest, 'craft-goal.md'), 'utf8');
    assert.match(text, /argument-hint: "\[idea\]"/);
    // Pi expands $@ for everything typed after the command.
    assert.match(text, /\n\$@\n$/);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install --commands --target codex writes a SKILL.md skill directory', () => {
  const dest = tempDir();
  try {
    const r = run(['install', 'weigh', '--commands', '--target', 'codex', '--dir', dest, '--json']);
    assert.equal(r.status, 0);
    const file = join(dest, 'weigh', 'SKILL.md');
    assert.ok(existsSync(file));
    const text = readFileSync(file, 'utf8');
    assert.match(text, /^---\nname: "weigh"\n/);
    assert.match(text, /Help me decide how to approach this\./);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install --commands --dry-run writes nothing', () => {
  const dest = tempDir();
  try {
    const r = run(['install', '--all', '--commands', '--dir', dest, '--dry-run', '--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.dryRun, true);
    assert.ok(parsed.installed.length > 0);
    assert.deepEqual(readdirSync(dest), []);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install --commands refuses to overwrite without --force', () => {
  const dest = tempDir();
  try {
    assert.equal(run(['install', 'catch-up', '--commands', '--dir', dest]).status, 0);
    const again = run(['install', 'catch-up', '--commands', '--dir', dest]);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists/);
    const forced = run(['install', 'catch-up', '--commands', '--dir', dest, '--force', '--json']);
    assert.equal(forced.status, 0);
    assert.equal(JSON.parse(forced.stdout).installed[0].action, 'overwrite');
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install --commands rejects an unknown command', () => {
  const dest = tempDir();
  try {
    const r = run(['install', 'nope', '--commands', '--dir', dest]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Unknown command/);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('install --commands rejects --all combined with command names', () => {
  const r = run(['install', '--all', '--commands', 'catch-up']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Cannot combine --all/);
});

test('install rejects an unknown target for commands', () => {
  const r = run(['install', 'catch-up', '--commands', '--target', 'claude']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown target/);
});

test('installing a command as a skill suggests --commands', () => {
  const dest = tempDir();
  try {
    const r = run(['install', 'catch-up', '--dir', dest]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Unknown skill: catch-up; did you mean --commands\?/);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});
