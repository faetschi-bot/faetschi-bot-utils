import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename as baseName, dirname, extname, join, relative, resolve } from 'node:path';
import {
  DEFAULT_DIAGRAM_FORMAT,
  DEFAULT_DIAGRAM_SCALE,
  DEFAULT_OUT_DIR,
  mermaidVersion,
} from '../config.mjs';
import { CliError } from '../errors.mjs';
import { downloadFile, ensureDir, launchBrowser, positive } from '../shared.mjs';

export const name = 'diagram';
export const aliases = ['mermaid', 'diagram-shot'];
export const summary = 'Render Mermaid diagrams to PNG or SVG';
export const needsBrowser = true;

export function usage() {
  return `visual-shot diagram <input> [options]

Render Mermaid diagrams to PNG or SVG.

Usage:
  visual-shot diagram <input.mmd> [--out out.png] [--format png|svg]
  visual-shot diagram <input.md>  [--out <dir>] [--format png|svg]
  visual-shot diagram - [--out out.png] < input.mmd

Options:
  --out <path>          output file for .mmd, output directory for .md
  --format <png|svg>    output format (default: ${DEFAULT_DIAGRAM_FORMAT})
  --theme <name>        Mermaid theme, e.g. default, dark, neutral, forest
  --background <color>  page background (default: transparent)
  --scale <n>           device scale factor for PNG (default: ${DEFAULT_DIAGRAM_SCALE})
  --md-out <file>       also write the markdown with image links (.md input)
  --json                print a machine-readable result object
  --help                show this help`;
}

export function parse(argv) {
  const o = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--out') o.out = val();
    else if (a === '--format') o.format = val();
    else if (a === '--theme') o.theme = val();
    else if (a === '--background') o.background = val();
    else if (a === '--scale') o.scale = Number(val());
    else if (a === '--md-out') o.mdOut = val();
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '-') o.positional.push(a);
    else if (a.startsWith('-')) throw new CliError(`Unknown option: ${a}`);
    else o.positional.push(a);
  }
  return o;
}

function parseMermaidFences(markdown) {
  const lines = markdown.split('\n');
  const fences = [];
  const definitions = [];
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(/^(\s*)(`{3,}|~{3,})[ \t]*mermaid[ \t]*\r?$/i);
    if (!open) {
      i++;
      continue;
    }
    const indent = open[1];
    const marker = open[2][0];
    const markerLen = open[2].length;
    const startLine = i;
    const body = [];
    i++;
    let closed = false;
    const closeRe = new RegExp(`^\\s*\\${marker}{${markerLen},}\\s*\\r?$`);
    while (i < lines.length) {
      if (closeRe.test(lines[i])) {
        closed = true;
        i++;
        break;
      }
      body.push(lines[i].replace(/\r$/, ''));
      i++;
    }
    if (closed) {
      fences.push({ startLine, endLine: i - 1, indent });
      definitions.push(body.join('\n').trim());
    }
  }
  return { fences, definitions };
}

function replaceFences(markdown, fences, replacementFor) {
  const lines = markdown.split('\n');
  const out = [];
  let cursor = 0;
  for (let k = 0; k < fences.length; k++) {
    const f = fences[k];
    for (let j = cursor; j < f.startLine; j++) out.push(lines[j]);
    out.push(`${f.indent}${replacementFor(k)}`);
    cursor = f.endLine + 1;
  }
  for (let j = cursor; j < lines.length; j++) out.push(lines[j]);
  return out.join('\n');
}

export function validate(opts) {
  const positional = opts.positional ?? [];
  if (positional.length === 0) {
    throw new CliError('missing input (expected: visual-shot diagram <input.mmd|input.md|->)');
  }
  if (positional.length > 1) {
    throw new CliError(`unexpected extra argument: ${positional[1]}`);
  }

  const format = opts.format || DEFAULT_DIAGRAM_FORMAT;
  if (format !== 'png' && format !== 'svg') {
    throw new CliError(`invalid --format "${opts.format}" (expected png or svg)`);
  }

  const input = positional[0];
  let kind;
  let content;
  let base;
  if (input === '-') {
    kind = 'mmd';
    content = readFileSync(0, 'utf8');
    base = 'diagram';
  } else {
    const ext = extname(input).toLowerCase();
    if (ext === '.mmd') kind = 'mmd';
    else if (ext === '.md' || ext === '.markdown') kind = 'md';
    else throw new CliError(`unsupported input "${input}" (expected .mmd, .md, .markdown, or -)`);
    if (!existsSync(input)) throw new CliError(`input not found: ${input}`);
    content = readFileSync(input, 'utf8');
    base = baseName(input, ext);
  }

  if (opts.mdOut && kind !== 'md') {
    throw new CliError('--md-out is only valid for markdown (.md) input');
  }

  let definitions;
  let fences = [];
  if (kind === 'md') {
    const parsed = parseMermaidFences(content);
    fences = parsed.fences;
    definitions = parsed.definitions;
    if (definitions.length === 0) {
      throw new CliError(`no mermaid code fences found in ${input}`);
    }
  } else {
    definitions = [content];
  }

  const outDir = process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR;
  const out = resolve(
    opts.out || (kind === 'mmd' ? join(outDir, `${base}.${format}`) : join(outDir, base)),
  );

  return {
    input,
    kind,
    base,
    content,
    definitions,
    fences,
    format,
    theme: opts.theme || 'default',
    background: opts.background || 'transparent',
    scale: positive(opts.scale, DEFAULT_DIAGRAM_SCALE, 'scale'),
    out,
    mdOut: opts.mdOut ? resolve(opts.mdOut) : null,
    json: Boolean(opts.json),
  };
}

function mermaidAssetPath(cache) {
  return join(cache, 'mermaid', `mermaid-${mermaidVersion()}.min.js`);
}

async function ensureMermaid(cache) {
  const asset = mermaidAssetPath(cache);
  if (existsSync(asset)) return asset;
  const url = `https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion()}/dist/mermaid.min.js`;
  try {
    await downloadFile(url, asset);
  } catch (e) {
    throw new CliError(`failed to download Mermaid ${mermaidVersion()} from ${url}: ${e.message}`, 1);
  }
  return asset;
}

const PAGE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>html, body { margin: 0; padding: 0; } #holder { display: inline-block; }</style>
</head>
<body>
<div id="holder"></div>
</body>
</html>`;

export async function run(plan, ctx) {
  const asset = await ensureMermaid(ctx.cache);
  const source = readFileSync(asset, 'utf8');

  const browser = await launchBrowser(ctx.chromium);
  const outputs = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: plan.scale,
    });
    await page.setContent(PAGE_HTML, { waitUntil: 'load' });
    await page.addScriptTag({ content: source });

    const hasMermaid = await page.evaluate(() => typeof window.mermaid !== 'undefined');
    if (!hasMermaid) throw new CliError('failed to load Mermaid into the page', 1);

    await page.evaluate((theme) => {
      window.mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' });
    }, plan.theme);

    for (let i = 0; i < plan.definitions.length; i++) {
      const index = i + 1;
      const id = `visualShotDiagram${index}`;
      const rendered = await page.evaluate(
        async ({ id, def }) => {
          try {
            const { svg } = await window.mermaid.render(id, def);
            return { ok: true, svg };
          } catch (e) {
            return { ok: false, error: e && e.message ? e.message : String(e) };
          }
        },
        { id, def: plan.definitions[i] },
      );
      if (!rendered.ok) {
        throw new CliError(`mermaid render failed (diagram ${index}): ${rendered.error}`, 1);
      }

      const outPath = plan.kind === 'md'
        ? join(plan.out, `${plan.base}-${index}.${plan.format}`)
        : plan.out;

      const size = await page.evaluate(
        ({ svg, background }) => {
          const holder = document.getElementById('holder');
          holder.innerHTML = svg;
          const el = holder.querySelector('svg');
          if (!el) return null;
          el.style.maxWidth = 'none';
          const vb = el.getAttribute('viewBox');
          if (vb) {
            const parts = vb.split(/[\s,]+/).map(Number);
            if (Number.isFinite(parts[2]) && parts[2] > 0) el.style.width = `${parts[2]}px`;
            if (Number.isFinite(parts[3]) && parts[3] > 0) el.style.height = `${parts[3]}px`;
          }
          el.style.background = background && background !== 'transparent' ? background : '';
          const r = el.getBoundingClientRect();
          return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
        },
        { svg: rendered.svg, background: plan.background },
      );
      if (!size) throw new CliError(`mermaid produced no SVG for diagram ${index}`, 1);

      ensureDir(outPath);
      if (plan.format === 'svg') {
        const outer = await page.evaluate(() => {
          const el = document.querySelector('#holder svg');
          return el ? el.outerHTML : null;
        });
        if (!outer) throw new CliError(`mermaid produced no SVG for diagram ${index}`, 1);
        writeFileSync(outPath, outer);
      } else {
        await page.setViewportSize({
          width: Math.max(1, size.width),
          height: Math.max(1, size.height),
        });
        await page.locator('#holder svg').screenshot({ path: outPath });
      }

      outputs.push({ out: outPath, index });
    }

    if (plan.mdOut) {
      const replaced = replaceFences(plan.content, plan.fences, (k) => {
        const rel = relative(dirname(plan.mdOut), outputs[k].out) || outputs[k].out;
        return `![diagram](${rel})`;
      });
      ensureDir(plan.mdOut);
      writeFileSync(plan.mdOut, replaced);
    }
  } finally {
    await browser.close();
  }

  if (plan.json) {
    const payload = {
      ok: true,
      format: plan.format,
      mermaidVersion: mermaidVersion(),
      outputs,
    };
    if (plan.mdOut) payload.mdOut = plan.mdOut;
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const o of outputs) console.log(`saved ${o.out}`);
    if (plan.mdOut) console.log(`saved ${plan.mdOut}`);
  }
  return 0;
}
