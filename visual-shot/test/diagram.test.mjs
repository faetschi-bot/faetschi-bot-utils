import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  markdownImageLink,
  parseMermaidFences,
  replaceFences,
} from '../lib/commands/diagram.mjs';

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));

function run(args, { cache, ...env } = {}) {
  const env2 = { ...process.env, ...env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env2 });
}

function emptyCache() {
  return mkdtempSync(join(tmpdir(), 'visual-shot-diagram-test-'));
}

test('diagram --help exits 0 and prints usage', () => {
  const r = run(['diagram', '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /visual-shot diagram/);
});

test('diagram missing input exits 2', () => {
  const r = run(['diagram']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /missing input/);
});

test('diagram nonexistent input exits 2', () => {
  const r = run(['diagram', '/nonexistent/nope.mmd']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /input not found/);
});

test('diagram unsupported extension exits 2', () => {
  const r = run(['diagram', 'foo.txt']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unsupported input/);
});

test('diagram invalid --format exits 2', () => {
  const r = run(['diagram', 'a.mmd', '--format', 'gif']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /invalid --format/);
});

test('diagram unknown option exits 2', () => {
  const r = run(['diagram', '--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown option/);
});

test('diagram missing value exits 2', () => {
  const r = run(['diagram', '--out']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing value/);
});

test('diagram --json with a bad input emits JSON and does not provision', () => {
  const cache = emptyCache();
  try {
    const r = run(['diagram', '--json'], { cache });
    assert.equal(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /missing input/);
    assert.equal(existsSync(join(cache, '.provisioned')), false);
    assert.equal(existsSync(join(cache, 'browsers')), false);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test('diagram non-numeric --scale exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-scale-'));
  try {
    const file = join(dir, 'a.mmd');
    writeFileSync(file, 'graph TD\n  A-->B\n');
    const r = run(['diagram', file, '--scale', 'abc']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--scale must be greater than 0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diagram directory input exits 2 with a friendly message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-dir-'));
  try {
    const fake = join(dir, 'docs.md');
    mkdirSync(fake);
    const r = run(['diagram', fake]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /input is not a file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diagram unclosed mermaid fence exits 2 with a distinct error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-unclosed-'));
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '```mermaid\ngraph TD\n  A-->B\n');
    const r = run(['diagram', file]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unclosed mermaid code fence/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diagram markdown without mermaid fences exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-nofence-'));
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '# just prose\n\nno fences here\n');
    const r = run(['diagram', file]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no mermaid code fences found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseMermaidFences handles CRLF line endings', () => {
  const md = ['# Title', '```mermaid', 'flowchart TD', '  A-->B', '```', ''].join('\r\n');
  const { definitions, fences } = parseMermaidFences(md);
  assert.deepEqual(definitions, ['flowchart TD\n  A-->B']);
  assert.equal(fences.length, 1);
  assert.equal(fences[0].startLine, 1);
  assert.equal(fences[0].endLine, 4);
});

test('parseMermaidFences recognizes tilde fences', () => {
  const md = ['~~~mermaid', 'graph LR', '~~~'].join('\n');
  const { definitions } = parseMermaidFences(md);
  assert.deepEqual(definitions, ['graph LR']);
});

test('parseMermaidFences throws on an unclosed mermaid fence', () => {
  const md = ['```mermaid', 'graph TD', '  A-->B'].join('\n');
  assert.throws(() => parseMermaidFences(md), /unclosed mermaid code fence/);
});

test('parseMermaidFences ignores mermaid nested in a longer non-mermaid fence', () => {
  const md = ['````text', '```mermaid', 'graph TD', '```', '````'].join('\n');
  const { definitions, fences } = parseMermaidFences(md);
  assert.equal(definitions.length, 0);
  assert.equal(fences.length, 0);
});

test('parseMermaidFences ignores a 4-space-indented pseudo-fence', () => {
  const md = ['    ```mermaid', '    graph TD', '    ```'].join('\n');
  const { definitions } = parseMermaidFences(md);
  assert.equal(definitions.length, 0);
});

test('parseMermaidFences accepts an info string with attributes', () => {
  const md = ['```mermaid {theme=dark}', 'graph TD', '```'].join('\n');
  const { definitions } = parseMermaidFences(md);
  assert.deepEqual(definitions, ['graph TD']);
});

test('parseMermaidFences finds zero, one, and many blocks', () => {
  assert.equal(parseMermaidFences('# prose\n\nno fences').definitions.length, 0);
  assert.equal(parseMermaidFences(['```mermaid', 'graph TD', '```'].join('\n')).definitions.length, 1);
  const many = [
    '```mermaid', 'graph TD', '```',
    'between',
    '~~~mermaid', 'graph LR', '~~~',
  ].join('\n');
  assert.equal(parseMermaidFences(many).definitions.length, 2);
});

test('replaceFences replaces only the mermaid fences', () => {
  const md = ['before', '```mermaid', 'graph TD', '```', 'after'].join('\n');
  const { fences } = parseMermaidFences(md);
  const out = replaceFences(md, fences, () => '![diagram](<x.png>)');
  assert.equal(out, ['before', '![diagram](<x.png>)', 'after'].join('\n'));
});

test('markdownImageLink wraps destinations in angle brackets', () => {
  assert.equal(markdownImageLink('a b (c).png'), '![diagram](<a b (c).png>)');
});
