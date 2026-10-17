import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('../skills/pr-artifacts/scripts/check-pr-artifact.mjs', import.meta.url),
);

function check(body) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-artifacts-test-'));
  const file = join(dir, 'body.md');
  writeFileSync(file, body);
  try {
    return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('accepts an image as artifact evidence', () => {
  const r = check('## Artifact\n\n![before and after](after-vs-before.png)\n');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /OK/);
});

test('accepts a Markdown table as artifact evidence', () => {
  const r = check('## Artifact\n\n| before | after |\n|---|---|\n| 500 | 200 |\n');
  assert.equal(r.status, 0);
});

test('accepts a Mermaid fence and a plain code block', () => {
  assert.equal(check('## Artifact\n\n```mermaid\nflowchart LR\n  A --> B\n```\n').status, 0);
  assert.equal(check('## Artifact\n\n```text\nbefore: 12 failures\nafter: 0 failures\n```\n').status, 0);
});

test('accepts a link as artifact evidence', () => {
  const r = check('## Artifact\n\nFull run: https://github.com/o/r/actions/runs/1\n');
  assert.equal(r.status, 0);
});

test('accepts the heading case-insensitively', () => {
  assert.equal(check('## ARTIFACT\n\n![x](x.png)\n').status, 0);
});

test('fails when the section is missing', () => {
  const r = check('## Summary\n\nNo artifact here.\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /## Artifact/);
});

test('fails when the section is empty or only comments', () => {
  assert.equal(check('## Artifact\n').status, 1);
  const r = check('## Artifact\n\n<!-- paste the recap here -->\n');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /empty/);
});

test('does not read evidence from a later section', () => {
  const r = check('## Artifact\n\n<!-- todo -->\n\n## Notes\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  assert.equal(r.status, 1);
});

test('--json reports the evidence kinds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pr-artifacts-test-'));
  const file = join(dir, 'body.md');
  writeFileSync(file, '## Artifact\n\n![x](x.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  try {
    const r = spawnSync(process.execPath, [script, file, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.evidence, ['image', 'table']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reads the body from stdin with -', () => {
  const r = spawnSync(process.execPath, [script, '-'], {
    encoding: 'utf8',
    input: '## Artifact\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
  });
  assert.equal(r.status, 0);
});

test('usage errors exit 2', () => {
  assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [script, '--nope'], { encoding: 'utf8' }).status, 2);
});
