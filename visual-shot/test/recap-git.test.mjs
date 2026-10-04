import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertValidRange, collectGitDiff, parseNameStatus, truncatePatch } from '../lib/recap/git.mjs';

// --- git --------------------------------------------------------------------

test('parseNameStatus maps status codes and rename columns', () => {
  const entries = parseNameStatus('M\tserver/a.ts\nD\told.ts\nR100\told/x.ts\tnew/x.ts\n');
  assert.deepEqual(entries, [
    { path: 'server/a.ts', change: 'modified' },
    { path: 'old.ts', change: 'removed' },
    { path: 'new/x.ts', change: 'renamed' },
  ]);
});

// --- git guards -------------------------------------------------------------

test('assertValidRange rejects option-like ranges and truncatePatch keeps UTF-8 on a boundary', () => {
  assert.throws(() => assertValidRange('--output=/tmp/x'), /invalid --diff range/);
  assert.equal(assertValidRange('main...HEAD'), 'main...HEAD');
  assert.throws(() => assertValidRange('main HEAD'), /whitespace/);

  const suffix = '\n… truncated\n';
  const text = `${'é'.repeat(64)}\nsecond line\n`;
  const maxBytes = 9;
  const out = truncatePatch(text, maxBytes);
  assert.doesNotMatch(out, /\uFFFD/);
  assert.ok(out.endsWith('truncated\n'));
  assert.ok(Buffer.byteLength(out, 'utf8') <= maxBytes + Buffer.byteLength(suffix, 'utf8'));

  assert.equal(truncatePatch('tiny', 100), 'tiny');
});

// --- collectGitDiff (fixture repo) ------------------------------------------

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'visual-shot-recap-git-'));
  const git = (args) => {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout;
  };
  git(['init', '-q', '-b', 'main']);
  return { repo, git };
}

function commit(git, message) {
  git(['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', message]);
}

// Builds a repo whose second commit exercises every change class and an
// awkward (space-containing) path. Returns the repo and its diff range.
function makeChangeRepo() {
  const { repo, git } = makeRepo();
  writeFileSync(join(repo, 'mod-a.ts'), 'export const a = 1;\n');
  writeFileSync(join(repo, 'mod-b.ts'), 'export const b = 1;\n');
  writeFileSync(join(repo, 'has space.txt'), 'one\n');
  writeFileSync(join(repo, 'rename-me.ts'), 'export const r = 1;\n');
  writeFileSync(join(repo, 'delete-me.ts'), 'gone\n');
  git(['add', '-A']);
  commit(git, 'base');

  writeFileSync(join(repo, 'mod-a.ts'), 'export const a = 2;\n');
  writeFileSync(join(repo, 'mod-b.ts'), 'export const b = 2;\n');
  writeFileSync(join(repo, 'has space.txt'), 'two\n');
  git(['mv', 'rename-me.ts', 'renamed.ts']);
  rmSync(join(repo, 'delete-me.ts'));
  writeFileSync(join(repo, 'added.ts'), 'export const n = 1;\n');
  git(['add', '-A']);
  commit(git, 'change');
  return { repo, range: 'HEAD~1..HEAD' };
}

test('collectGitDiff pairs one bounded patch per kept file, including renames and spaces', () => {
  const { repo, range } = makeChangeRepo();
  try {
    const data = collectGitDiff({ repo, range });

    // Entry order mirrors `git diff --name-status` (sorted by new path).
    assert.deepEqual(data.entries, [
      { path: 'added.ts', change: 'added' },
      { path: 'delete-me.ts', change: 'removed' },
      { path: 'has space.txt', change: 'modified' },
      { path: 'mod-a.ts', change: 'modified' },
      { path: 'mod-b.ts', change: 'modified' },
      { path: 'renamed.ts', change: 'renamed' },
    ]);
    assert.equal(data.total, 6);
    assert.equal(data.truncated, false);

    // One patch per entry, keyed and ordered like the entries.
    assert.deepEqual([...data.patches.keys()], data.entries.map((entry) => entry.path));
    assert.match(data.patches.get('mod-a.ts'), /\+export const a = 2;/);
    assert.match(data.patches.get('mod-b.ts'), /\+export const b = 2;/);
    assert.match(data.patches.get('has space.txt'), /\+two/);
    assert.match(data.patches.get('added.ts'), /\+export const n = 1;/);
    assert.match(data.patches.get('delete-me.ts'), /-gone/);
    // A renamed file's patch maps to the new path, never the old one.
    assert.match(data.patches.get('renamed.ts'), /renamed\.ts/);
    assert.equal(data.patches.has('rename-me.ts'), false);
    assert.equal(data.patches.size, data.entries.length);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('collectGitDiff truncates to maxFiles and flags the truncation', () => {
  const { repo, range } = makeChangeRepo();
  try {
    const data = collectGitDiff({ repo, range, maxFiles: 3 });

    assert.equal(data.total, 6);
    assert.equal(data.truncated, true);
    assert.deepEqual([...data.patches.keys()], data.entries.slice(0, 3).map((entry) => entry.path));
    assert.equal(data.patches.size, 3);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
