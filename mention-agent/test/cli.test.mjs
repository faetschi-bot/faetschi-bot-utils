import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/mention-agent.mjs', import.meta.url));

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...options });
}

function gitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'mention-agent-test-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/widget.git'], { cwd: dir });
  return dir;
}

function doctor(dir) {
  const result = run(['doctor', '--no-remote', '--json', '--repo', dir]);
  return { status: result.status, body: JSON.parse(result.stdout) };
}

test('--help exits 0 and prints usage', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test('no command exits 0 and prints usage', () => {
  const r = run([]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test('unknown option exits 2', () => {
  const r = run(['--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});

test('missing value exits 2', () => {
  const r = run(['setup', '--mention']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing value/);
});

test('--version prints the tool version', () => {
  const r = run(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^mention-agent \d+\.\d+\.\d+/);
});

test('setup requires a mention phrase', () => {
  const dir = gitRepo();
  try {
    const r = run(['setup', '--repo', dir]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /mention is required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup refuses to run outside a git work tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mention-agent-test-'));
  try {
    const r = run(['setup', '--repo', dir, '--mention', '@example-bot']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not inside a git work tree/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup writes config and workflow, and doctor passes', () => {
  const dir = gitRepo();
  try {
    const r = run(['setup', '--repo', dir, '--mention', '@example-bot', '--allow-users', 'alice,bob', '--token-secret', 'EXAMPLE_TOKEN']);
    assert.equal(r.status, 0, r.stderr);

    const config = JSON.parse(readFileSync(join(dir, '.mention-agent.json'), 'utf8'));
    assert.equal(config.mention, '@example-bot');
    assert.equal(config.selfLogin, 'example-bot');
    assert.deepEqual(config.allowUsers, ['alice', 'bob']);
    assert.equal(config.tokenSecret, 'EXAMPLE_TOKEN');
    assert.equal(config.workflow.ref, 'mention-agent-v1');
    assert.ok(!config.workflow.reusableRepo.endsWith('/'), 'reusableRepo is owner/repo');

    const workflow = readFileSync(join(dir, '.github/workflows/mention-agent.yml'), 'utf8');
    assert.match(workflow, /uses: .*mention-agent\.yml@mention-agent-v1/);
    assert.match(workflow, /secrets\.EXAMPLE_TOKEN/);

    const { status, body } = doctor(dir);
    assert.equal(status, 0);
    assert.equal(body.ok, true);
    assert.ok(body.checks.find((c) => c.name === 'workflow-current' && c.ok));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup keeps existing files without --force and overwrites with it', () => {
  const dir = gitRepo();
  try {
    assert.equal(run(['setup', '--repo', dir, '--mention', '@example-bot', '--allow-users', 'alice']).status, 0);
    const first = readFileSync(join(dir, '.github/workflows/mention-agent.yml'), 'utf8');

    const second = run(['setup', '--repo', dir, '--mention', '@other-bot']);
    assert.equal(second.status, 0);
    assert.equal(readFileSync(join(dir, '.github/workflows/mention-agent.yml'), 'utf8'), first);

    const forced = run(['setup', '--repo', dir, '--mention', '@other-bot', '--force']);
    assert.equal(forced.status, 0);
    assert.match(readFileSync(join(dir, '.mention-agent.json'), 'utf8'), /@other-bot/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup --dry-run writes nothing', () => {
  const dir = gitRepo();
  try {
    const r = run(['setup', '--repo', dir, '--mention', '@example-bot', '--allow-users', 'alice', '--dry-run']);
    assert.equal(r.status, 0);
    assert.equal(existsSync(join(dir, '.mention-agent.json')), false);
    assert.equal(existsSync(join(dir, '.github/workflows/mention-agent.yml')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('update regenerates the workflow from the stored config', () => {
  const dir = gitRepo();
  try {
    run(['setup', '--repo', dir, '--mention', '@example-bot', '--allow-users', 'alice', '--no-share']);
    writeFileSync(join(dir, '.github/workflows/mention-agent.yml'), '# stale\n');
    assert.equal(doctor(dir).body.ok, false, 'stale workflow should fail doctor');

    const r = run(['update', '--repo', dir]);
    assert.equal(r.status, 0);
    assert.equal(doctor(dir).body.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor fails when the workflow is missing', () => {
  const dir = gitRepo();
  try {
    run(['setup', '--repo', dir, '--mention', '@example-bot', '--allow-users', 'alice']);
    rmSync(join(dir, '.github/workflows/mention-agent.yml'));
    const { status, body } = doctor(dir);
    assert.equal(status, 1);
    assert.equal(body.ok, false);
    assert.ok(body.checks.find((c) => c.name === 'workflow' && !c.ok));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor reports a non-git directory as a failed check, not a crash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mention-agent-test-'));
  try {
    const { status, body } = doctor(dir);
    assert.equal(status, 1);
    assert.equal(body.ok, false);
    assert.equal(body.checks[0].name, 'repo');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('print emits the caller without writing files', () => {
  const dir = gitRepo();
  try {
    const r = run(['print', '--repo', dir, '--mention', '@example-bot']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /name: mention-agent/);
    assert.match(r.stdout, /@example-bot/);
    assert.equal(existsSync(join(dir, '.mention-agent.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('print --standalone emits a self-contained workflow', () => {
  const dir = gitRepo();
  try {
    const r = run(['print', '--repo', dir, '--mention', '@example-bot', '--standalone', '--allow-users', 'alice']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /use_github_token: true/);
    assert.match(r.stdout, /actions\/checkout@v4/);
    assert.doesNotMatch(r.stdout, /uses: .*mention-agent\.yml@/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty allowlist fails doctor', () => {
  const dir = gitRepo();
  try {
    run(['setup', '--repo', dir, '--mention', '@example-bot', '--allow-any-writer']);
    const { status, body } = doctor(dir);
    assert.equal(status, 1);
    assert.ok(body.checks.find((c) => c.name === 'allowlist' && !c.ok));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup requires an allowlist unless --allow-any-writer is given', () => {
  const dir = gitRepo();
  try {
    const r = run(['setup', '--repo', dir, '--mention', '@example-bot']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--allow-users/);
    const ok = run(['setup', '--repo', dir, '--mention', '@example-bot', '--allow-any-writer']);
    assert.equal(ok.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup prints the security checklist and defaults to comment-only', () => {
  const dir = gitRepo();
  try {
    const r = run(['setup', '--repo', dir, '--mention', '@example-bot', '--allow-users', 'alice']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /security checklist/);
    assert.match(r.stdout, /fine-grained token scoped to THIS repository/);
    assert.match(readFileSync(join(dir, '.github/workflows/mention-agent.yml'), 'utf8'), /allow-writes: false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown provider without explicit env/secret/model exits 2', () => {
  const dir = gitRepo();
  try {
    const r = run(['setup', '--repo', dir, '--mention', '@example-bot', '--provider', 'acme']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown provider/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
