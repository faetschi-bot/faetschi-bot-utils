import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecap } from '../lib/recap/render.mjs';
import { RECAP_GFM_MARKER, escapeCell, fenceFor, renderRecapGfm } from '../lib/recap/gfm.mjs';

// GFM output is a pure string transform, so every test here is Node-only: no
// browser, no provisioning. The CLI tests spawn the real bin with an empty
// cache to prove `--format gfm` never touches Playwright.

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));

function run(args, { cache, ...env } = {}) {
  const env2 = { ...process.env };
  delete env2.VISUAL_URL;
  delete env2.VISUAL_OUT_DIR;
  Object.assign(env2, env);
  if (cache) env2.VISUAL_SHOT_CACHE = cache;
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env2 });
}

function emptyCache() {
  return mkdtempSync(join(tmpdir(), 'visual-shot-recap-gfm-'));
}

function writeJson(dir, value) {
  const file = join(dir, 'recap.json');
  writeFileSync(file, JSON.stringify(value));
  return file;
}

// --- pure GFM rendering ------------------------------------------------------

test('renderRecapGfm maps the representable blocks to Markdown', () => {
  const md = renderRecapGfm({
    version: 1,
    title: 'Recap <Title>',
    brief: 'A **brief**.',
    meta: 'meta line',
    blocks: [
      { type: 'notes', title: 'Notes', markdown: 'Some **notes**.' },
      { type: 'callout', tone: 'risk', title: 'Heads up', body: 'line one\n\nline two' },
      { type: 'file-tree', title: 'Files', entries: [{ path: 'a.ts', change: 'added', note: 'new' }] },
      { type: 'diff', filename: 'a.ts', summary: 'changed', before: 'old\n', after: 'new\n' },
      { type: 'mermaid', source: 'graph TD; A-->B', caption: 'A flow' },
      { type: 'table', columns: ['Name', 'Value'], rows: [['x', 1]] },
      {
        type: 'data-model',
        entities: [{ name: 'users', fields: [{ name: 'id', type: 'uuid', pk: true, change: 'added' }] }],
      },
      {
        type: 'api-endpoint',
        method: 'POST',
        path: '/v1/messages',
        params: [{ name: 'model', in: 'body', type: 'string', required: true, change: 'modified', was: 'model_id' }],
        responses: [{ status: '200', description: 'OK' }],
      },
      { type: 'checklist', items: [{ label: 'done', checked: true }, { label: 'todo' }] },
    ],
  });

  assert.ok(md.startsWith(`${RECAP_GFM_MARKER}\n`), 'the sticky marker is the first line');
  assert.match(md, /# Recap &lt;Title&gt;/);
  assert.match(md, /> _risk_/);
  assert.match(md, /> \*\*Heads up\*\*/);
  assert.match(md, /```mermaid\ngraph TD; A-->B\n```/);

  // diff: details + a diff fence with both signs
  assert.match(md, /<details>\n<summary>a\.ts — changed<\/summary>/);
  assert.match(md, /```diff\n-old\n\+new\n```/);

  assert.match(md, /\| \| File \| Note \|/);
  assert.match(md, /\| A \| a\.ts \| new \|/);
  assert.match(md, /\| Name \| Value \|/);
  assert.match(md, /\| x \| 1 \|/);
  assert.match(md, /\| Field \| Type \| Keys \| Change \|/);
  assert.match(md, /\| id \| uuid \| PK \| added \|/);
  assert.match(md, /### `POST \/v1\/messages`/);
  assert.match(md, /\| Name \| In \| Type \| Required \| Change\/Notes \|/);
  assert.match(md, /modified \(was model_id\)/);
  assert.match(md, /- \[x\] done/);
  assert.match(md, /- \[ \] todo/);
});

test('renderRecapGfm renders a json block as a pretty-printed json fence', () => {
  const md = renderRecapGfm({
    version: 1,
    title: 'T',
    blocks: [{ type: 'json', title: 'Payload', data: { a: 1, b: [true, null] } }],
  });
  assert.match(md, /<summary>Payload<\/summary>/);
  assert.match(md, /```json\n\{\n {2}"a": 1,/);
  assert.match(md, /"b": \[/);
});

test('renderRecapGfm never leaks diagram/wireframe html or css', () => {
  const payload = {
    version: 1,
    title: 'T',
    blocks: [
      { type: 'wireframe', caption: 'A mock', html: '<div class="secret-tag">x</div>', css: '.secret-css{color:red}' },
      { type: 'diagram', caption: 'A diagram', html: '<svg class="secret-svg"></svg>', css: '.secret-css{fill:blue}' },
    ],
  };
  const md = renderRecapGfm(payload);
  assert.doesNotMatch(md, /secret-tag/);
  assert.doesNotMatch(md, /secret-svg/);
  assert.doesNotMatch(md, /secret-css/);
  assert.doesNotMatch(md, /<div/);
  assert.doesNotMatch(md, /<svg/);
  assert.match(md, /_Interactive wireframe “A mock” — see the rendered report\._/);
  assert.match(md, /_Interactive diagram “A diagram” — see the rendered report\._/);

  const linked = renderRecapGfm(payload, { reportUrl: 'https://example.test/report.html' });
  assert.match(linked, /_Interactive wireframe “A mock” — see the \[rendered report\]\(<https:\/\/example\.test\/report\.html>\)\._/);
});

test('renderRecapGfm escapes pipes and newlines inside table cells', () => {
  const md = renderRecapGfm({
    version: 1,
    title: 'T',
    blocks: [{ type: 'table', columns: ['A', 'B'], rows: [['x | y\nz', 'ok']] }],
  });
  assert.match(md, /\| x \\\| y<br>z \| ok \|/);
  assert.doesNotMatch(md, /y\nz/);
  assert.equal(escapeCell('a|b\nc'), 'a\\|b<br>c');
});

test('renderRecapGfm grows the fence past backtick runs in the content', () => {
  const source = 'graph TD\n  A["```"] --> B';
  const md = renderRecapGfm({
    version: 1,
    title: 'T',
    blocks: [{ type: 'mermaid', source }],
  });
  const fence = fenceFor(source, 'mermaid');
  assert.match(fence, /^````mermaid\n/);
  assert.ok(md.includes(fence), 'the fence is longer than the run inside it');
});

test('renderRecapGfm links report and image URLs when provided', () => {
  const md = renderRecapGfm(
    { version: 1, title: 'T', blocks: [{ type: 'notes', markdown: 'x' }] },
    { reportUrl: 'https://example.test/report.html', imageUrl: 'https://example.test/report.png' },
  );
  assert.match(md, /\[Open the interactive recap\]\(<https:\/\/example\.test\/report\.html>\)/);
  assert.match(md, /!\[Visual recap\]\(<https:\/\/example\.test\/report\.png>\)/);
});

// --- hostile destinations and prose -----------------------------------------

test('renderRecapGfm neutralises a hostile image destination and alt', () => {
  const src = 'https://x/a.png) <img src=x onerror=alert(1)>\nnext';
  const alt = 'a] ) <img src=z> [b';
  const md = renderRecapGfm({
    version: 1,
    title: 'T',
    blocks: [{ type: 'image', src, alt }],
  });

  // No raw tag leaks from src or alt, and no destination bracket breakout.
  assert.doesNotMatch(md, /<img/);
  assert.doesNotMatch(md, /<script/);
  // `<`/`>` in the destination are percent-encoded and the newline is stripped.
  assert.match(md, /\[a\\\] \) &lt;img src=z&gt; \\\[b\]\(<https:\/\/x\/a\.png\) %3Cimg src=x onerror=alert\(1\)%3Enext>\)/);
  // The image stayed on a single line: the stray newline cannot split it.
  assert.equal(md.split('\n').filter((line) => line.includes('a.png')).length, 1);
});

test('renderRecapGfm keeps an api-endpoint heading on one line', () => {
  const md = renderRecapGfm({
    version: 1,
    title: 'T',
    blocks: [{ type: 'api-endpoint', method: 'GET', path: '/a\nb`c' }],
  });
  // oneLine flattens the path and inlineCode grows its fence past the backtick.
  assert.match(md, /### ``GET \/a b`c``/);
  assert.doesNotMatch(md, /GET \/a\nb/);
});

test('renderRecapGfm neutralises HTML in prose but keeps Markdown', () => {
  const md = renderRecapGfm({
    version: 1,
    title: 'T',
    brief: 'A <script>alert(1)</script> brief with **bold**.',
    blocks: [
      { type: 'notes', markdown: 'Notes <img src=x onerror=1> and `code`.' },
      { type: 'callout', tone: 'risk', title: 'T <b>x</b>', body: 'Body <script>y</script>' },
    ],
  });

  assert.doesNotMatch(md, /<script/);
  assert.doesNotMatch(md, /<img/);
  assert.doesNotMatch(md, /<b>/);
  assert.match(md, /A &lt;script&gt;alert\(1\)&lt;\/script&gt; brief with \*\*bold\*\*\./);
  assert.match(md, /Notes &lt;img src=x onerror=1&gt; and `code`\./);
  assert.match(md, /> \*\*T &lt;b&gt;x&lt;\/b&gt;\*\*/);
  assert.match(md, /> Body &lt;script&gt;y&lt;\/script&gt;/);
});

test('renderRecapGfm renders an empty patch as a note, not an empty fence', () => {
  const md = renderRecapGfm({
    version: 1,
    title: 'T',
    blocks: [{ type: 'patch', filename: 'a.ts', patch: '   \n' }],
  });
  assert.match(md, /<summary>a\.ts<\/summary>\n\n_No textual changes\._/);
  assert.doesNotMatch(md, /```diff/);
});

// --- dark default ------------------------------------------------------------

test('buildRecap defaults to the dark theme and stays overridable', () => {
  const recap = { version: 1, title: 'T', blocks: [{ type: 'notes', markdown: 'x' }] };
  const dark = buildRecap(recap);
  assert.match(dark.html, /<body class="theme-dark">/);
  assert.equal(dark.theme, 'dark');

  const light = buildRecap(recap, { theme: 'light' });
  assert.match(light.html, /<body class="theme-light">/);
});

// --- CLI ---------------------------------------------------------------------

test('recap --format gfm writes a .md file without provisioning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-gfm-cli-'));
  const cache = emptyCache();
  try {
    const file = writeJson(dir, { version: 1, title: 'GFM recap', blocks: [{ type: 'notes', markdown: 'hi' }] });
    const out = join(dir, 'out.md');
    const r = run(['recap', '--from', file, '--format', 'gfm', '--out', out, '--json'], { cache });
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.format, 'gfm');
    assert.equal(parsed.markdown, out);
    assert.equal(existsSync(out), true);
    const md = readFileSync(out, 'utf8');
    assert.ok(md.startsWith(`${RECAP_GFM_MARKER}\n`));
    assert.equal(existsSync(join(cache, '.provisioned')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test('recap --format gfm defaults --out to recap.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-gfm-default-'));
  const outDir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-gfm-out-'));
  const cache = emptyCache();
  try {
    const file = writeJson(dir, { version: 1, title: 'GFM recap', blocks: [{ type: 'notes', markdown: 'hi' }] });
    const r = run(['recap', '--from', file, '--format', 'gfm', '--json'], { cache, VISUAL_OUT_DIR: outDir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(join(outDir, 'recap.md')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test('recap --format bogus exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-shot-recap-gfm-bad-'));
  const cache = emptyCache();
  try {
    const file = writeJson(dir, { version: 1, title: 'T', blocks: [{ type: 'notes', markdown: 'x' }] });
    const r = run(['recap', '--from', file, '--format', 'bogus'], { cache });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /invalid --format/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});
