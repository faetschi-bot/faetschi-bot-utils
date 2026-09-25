import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ansiToHtml, collapseCarriageReturns } from '../lib/commands/term.mjs';

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));

function run(args, { cache, ...env } = {}) {
  const env2 = { ...process.env, ...env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env2 });
}

function emptyCache() {
  return mkdtempSync(join(tmpdir(), 'visual-shot-term-test-'));
}

test('term --help exits 0 and prints usage', () => {
  const r = run(['term', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /visual-shot term/);
});

test('term with no command exits 2', () => {
  const r = run(['term']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no command given/);
});

test('term unknown option exits 2', () => {
  const r = run(['term', '--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});

test('term invalid --width exits 2 without provisioning', () => {
  const cache = emptyCache();
  try {
    const r = run(['term', '--width', '0', '--', 'echo', 'hi'], { cache });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--width must be greater than 0/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('term --json with no command emits JSON and does not provision', () => {
  const cache = emptyCache();
  try {
    const r = run(['term', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /no command given/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
    assert.equal(existsSync(join(cache, 'browsers')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('term --max-lines rejects fractions', () => {
  const r = run(['term', '--max-lines', '2.5', '--', 'echo', 'hi']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--max-lines must be an integer/);
});

test('ansiToHtml escapes HTML metacharacters', () => {
  assert.equal(ansiToHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('ansiToHtml applies SGR bold and reset', () => {
  assert.equal(
    ansiToHtml('\u001b[1mbold\u001b[0mplain'),
    '<span style="font-weight:700">bold</span>plain',
  );
});

test('ansiToHtml maps 256-color SGR', () => {
  assert.equal(
    ansiToHtml('\u001b[38;5;196mx'),
    '<span style="color:rgb(255,0,0)">x</span>',
  );
});

test('ansiToHtml maps truecolor SGR', () => {
  assert.equal(
    ansiToHtml('\u001b[38;2;10;20;30mx'),
    '<span style="color:rgb(10,20,30)">x</span>',
  );
});

test('ansiToHtml ignores out-of-range truecolor values', () => {
  assert.equal(ansiToHtml('\u001b[38;2;300;-1;30mx'), 'x');
  assert.equal(ansiToHtml('\u001b[48;2;-1;0;0mx'), 'x');
});

test('ansiToHtml drops an unterminated CSI but keeps the rest', () => {
  assert.equal(ansiToHtml('x\u001b[12'), 'x12');
});

test('ansiToHtml consumes a terminated OSC sequence', () => {
  assert.equal(ansiToHtml('a\u001b]0;title\u0007b'), 'ab');
});

test('ansiToHtml keeps text after an unterminated OSC', () => {
  assert.equal(ansiToHtml('a\u001b]0;title'), 'a0;title');
});

test('collapseCarriageReturns uses terminal overwrite semantics', () => {
  assert.deepEqual(collapseCarriageReturns('foo\r'), ['foo']);
  assert.deepEqual(collapseCarriageReturns('hello\rhi'), ['hillo']);
  assert.deepEqual(collapseCarriageReturns('a\rb\rc'), ['c']);
  assert.deepEqual(collapseCarriageReturns('12345\r'), ['12345']);
});

test('collapseCarriageReturns returns no lines for empty input', () => {
  assert.deepEqual(collapseCarriageReturns(''), []);
  assert.deepEqual(collapseCarriageReturns('\n'), []);
});
