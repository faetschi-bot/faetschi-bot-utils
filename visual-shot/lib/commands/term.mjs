import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  DEFAULT_OUT_DIR,
  DEFAULT_TERM_FONT_SIZE,
  DEFAULT_TERM_TIMEOUT,
  DEFAULT_TERM_WIDTH,
  MAX_TERM_LINES,
} from '../config.mjs';
import { CliError } from '../errors.mjs';
import { ensureDir, launchBrowser } from '../shared.mjs';

export const name = 'term';
export const aliases = ['terminal', 'terminal-shot'];
export const summary = 'Render a command\'s output as a terminal-style PNG';
export const needsBrowser = true;

export function usage() {
  return `visual-shot term [options] -- <command...>

Run a command, capture its stdout/stderr, and render it as a terminal-style PNG.

Usage:
  visual-shot term [options] -- <command...>
  visual-shot term [options] <command...>
  visual-shot term [options] --shell "<command string>"

Options:
  --out <path>         output PNG (default: $VISUAL_OUT_DIR/term.png)
  --title <text>       render a title bar above the output
  --width <px>         image width (default: ${DEFAULT_TERM_WIDTH})
  --font-size <px>     terminal font size (default: ${DEFAULT_TERM_FONT_SIZE})
  --max-lines <n>      cap rendered lines (default: ${MAX_TERM_LINES})
  --timeout <ms>       kill the command after this (default: ${DEFAULT_TERM_TIMEOUT})
  --fail-on-error      exit 1 when the command exits non-zero
  --shell "<string>"   run a single command string through the shell
  --json               print a machine-readable result object
  --help               show this help`;
}

export function parse(argv) {
  const o = { command: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      o.command = argv.slice(i + 1);
      return o;
    }
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--out') o.out = val();
    else if (a === '--title') o.title = val();
    else if (a === '--width') o.width = Number(val());
    else if (a === '--font-size') o.fontSize = Number(val());
    else if (a === '--max-lines') o.maxLines = Number(val());
    else if (a === '--timeout') o.timeout = Number(val());
    else if (a === '--shell') o.shell = val();
    else if (a === '--fail-on-error') o.failOnError = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('-')) throw new CliError(`Unknown option: ${a}`);
    else {
      // First non-option token begins the command; everything after belongs to it.
      o.command = argv.slice(i);
      return o;
    }
  }
  return o;
}

function positiveNumber(value, fallback, flag) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new CliError(`--${flag} must be greater than 0 (got ${value})`);
  }
  return n;
}

export function validate(opts) {
  const width = positiveNumber(opts.width, DEFAULT_TERM_WIDTH, 'width');
  const fontSize = positiveNumber(opts.fontSize, DEFAULT_TERM_FONT_SIZE, 'font-size');
  const maxLines = positiveNumber(opts.maxLines, MAX_TERM_LINES, 'max-lines');
  const timeout = positiveNumber(opts.timeout, DEFAULT_TERM_TIMEOUT, 'timeout');

  const command = opts.command ?? [];
  const shell = opts.shell ?? null;
  if (shell && command.length > 0) {
    throw new CliError('cannot combine --shell with a command');
  }
  if (!shell && command.length === 0) {
    throw new CliError('no command given (expected: visual-shot term [options] -- <command...>)');
  }

  const out = resolve(
    opts.out || join(process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR, 'term.png'),
  );
  return {
    command,
    shell,
    out,
    title: opts.title ?? null,
    width,
    fontSize,
    maxLines,
    timeout,
    failOnError: Boolean(opts.failOnError),
    json: Boolean(opts.json),
  };
}

const ANSI_16 = [
  '#000000', '#cd3131', '#0dbc79', '#e5e510',
  '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
];
const ANSI_16_BRIGHT = [
  '#666666', '#f14c4c', '#23d18b', '#f5f543',
  '#3b8eea', '#d670d6', '#29b8db', '#ffffff',
];

function xterm256(n) {
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 8) return ANSI_16[n];
  if (n < 16) return ANSI_16_BRIGHT[n - 8];
  if (n < 232) {
    const v = n - 16;
    const r = Math.floor(v / 36);
    const g = Math.floor((v % 36) / 6);
    const b = v % 6;
    const c = (x) => (x === 0 ? 0 : 55 + x * 40);
    return `rgb(${c(r)},${c(g)},${c(b)})`;
  }
  if (n <= 255) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  return null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ansiToHtml(text) {
  const state = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
  const reset = () => {
    state.fg = null;
    state.bg = null;
    state.bold = false;
    state.dim = false;
    state.italic = false;
    state.underline = false;
  };

  const applySgr = (params) => {
    const codes = params === '' ? [0] : params.split(';').map((p) => (p === '' ? 0 : Number(p)));
    for (let k = 0; k < codes.length; k++) {
      const c = codes[k];
      if (c === 0) reset();
      else if (c === 1) state.bold = true;
      else if (c === 2) state.dim = true;
      else if (c === 3) state.italic = true;
      else if (c === 4) state.underline = true;
      else if (c === 22) {
        state.bold = false;
        state.dim = false;
      } else if (c === 23) state.italic = false;
      else if (c === 24) state.underline = false;
      else if (c >= 30 && c <= 37) state.fg = ANSI_16[c - 30];
      else if (c === 39) state.fg = null;
      else if (c >= 40 && c <= 47) state.bg = ANSI_16[c - 40];
      else if (c === 49) state.bg = null;
      else if (c >= 90 && c <= 97) state.fg = ANSI_16_BRIGHT[c - 90];
      else if (c >= 100 && c <= 107) state.bg = ANSI_16_BRIGHT[c - 100];
      else if (c === 38 || c === 48) {
        const target = c === 38 ? 'fg' : 'bg';
        const mode = codes[k + 1];
        if (mode === 5) {
          const col = xterm256(codes[k + 2]);
          if (col) state[target] = col;
          k += 2;
        } else if (mode === 2) {
          const r = codes[k + 2];
          const g = codes[k + 3];
          const b = codes[k + 4];
          if ([r, g, b].every((x) => Number.isFinite(x))) {
            state[target] = `rgb(${r},${g},${b})`;
          }
          k += 4;
        }
      }
    }
  };

  const styleAttr = () => {
    const parts = [];
    if (state.fg) parts.push(`color:${state.fg}`);
    if (state.bg) parts.push(`background-color:${state.bg}`);
    if (state.bold) parts.push('font-weight:700');
    if (state.dim) parts.push('opacity:.65');
    if (state.italic) parts.push('font-style:italic');
    if (state.underline) parts.push('text-decoration:underline');
    return parts.join(';');
  };

  const emit = (segment) => {
    if (segment === '') return '';
    const safe = escapeHtml(segment);
    const attr = styleAttr();
    return attr ? `<span style="${attr}">${safe}</span>` : safe;
  };

  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\u001b') {
      const next = text[i + 1];
      if (next === '[') {
        let j = i + 2;
        while (j < text.length) {
          const code = text.charCodeAt(j);
          if (code >= 0x40 && code <= 0x7e) break;
          j++;
        }
        if (j >= text.length) break;
        if (text[j] === 'm') applySgr(text.slice(i + 2, j));
        i = j + 1;
        continue;
      }
      if (next === ']') {
        let j = i + 2;
        while (j < text.length) {
          if (text[j] === '\u0007') break;
          if (text[j] === '\u001b' && text[j + 1] === '\\') break;
          j++;
        }
        if (j < text.length && text[j] === '\u001b') i = j + 2;
        else i = j + 1;
        continue;
      }
      i += 2;
      continue;
    }
    let j = i;
    while (j < text.length && text[j] !== '\u001b') j++;
    out += emit(text.slice(i, j));
    i = j;
  }
  return out;
}

function buildHtml(plan, bodyHtml) {
  const titleBar = plan.title
    ? `<div class="titlebar"><span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span><span class="title">${escapeHtml(plan.title)}</span></div>`
    : '';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #11111b; }
  #terminal {
    display: inline-block;
    width: ${plan.width}px;
    background: #1e1e2e;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 0 0 1px #313244;
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 12px;
    background: #181825;
    border-bottom: 1px solid #313244;
    font-family: 'DejaVu Sans Mono', 'Liberation Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    color: #a6adc8;
  }
  .titlebar .title { margin-left: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
  .dot-red { background: #f38ba8; }
  .dot-yellow { background: #f9e2af; }
  .dot-green { background: #a6e3a1; }
  .term {
    margin: 0;
    padding: 16px 18px;
    box-sizing: border-box;
    width: 100%;
    color: #cdd6f4;
    font-family: 'DejaVu Sans Mono', 'Liberation Mono', Menlo, Consolas, 'Courier New', monospace;
    font-size: ${plan.fontSize}px;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
</head>
<body>
<div id="terminal">
${titleBar}
<pre class="term">${bodyHtml}</pre>
</div>
</body>
</html>`;
}

function runCommand(plan) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const chunks = [];
    let timedOut = false;
    let spawnError = null;
    let settled = false;

    const spawnOptions = {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // A new process group lets the timeout kill the command and its children.
      detached: process.platform !== 'win32',
    };
    let child;
    try {
      if (plan.shell) {
        child = spawn(plan.shell, { ...spawnOptions, shell: true });
      } else {
        child = spawn(plan.command[0], plan.command.slice(1), spawnOptions);
      }
    } catch (e) {
      resolvePromise({
        output: '',
        exitCode: null,
        signal: null,
        timedOut: false,
        durationMs: Date.now() - started,
        error: e.message,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }, plan.timeout);

    child.stdout?.on('data', (d) => chunks.push(d.toString('utf8')));
    child.stderr?.on('data', (d) => chunks.push(d.toString('utf8')));
    child.on('error', (e) => {
      spawnError = e;
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        output: chunks.join(''),
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        durationMs: Date.now() - started,
        error: spawnError ? spawnError.message : null,
      });
    });
  });
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

// Progress output overwrites a line with \r; keep only the final state of each line.
function collapseCarriageReturns(text) {
  return text
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => {
      const idx = line.lastIndexOf('\r');
      return idx === -1 ? line : line.slice(idx + 1);
    });
}

async function renderPng(plan, bodyHtml, ctx) {
  const browser = await launchBrowser(ctx.chromium);
  try {
    const page = await browser.newPage({
      viewport: { width: plan.width + 64, height: 720 },
      deviceScaleFactor: 1,
    });
    await page.setContent(buildHtml(plan, bodyHtml), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const size = await page.evaluate(() => {
      const el = document.getElementById('terminal');
      const r = el.getBoundingClientRect();
      return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
    });
    await page.setViewportSize({
      width: Math.max(1, size.width),
      height: Math.max(1, size.height),
    });
    ensureDir(plan.out);
    await page.locator('#terminal').screenshot({ path: plan.out });
  } finally {
    await browser.close();
  }
}

export async function run(plan, ctx) {
  const result = await runCommand(plan);

  let output = result.output;
  let exitCode = result.exitCode;
  if (result.error) {
    if (exitCode === null) exitCode = 127;
    const note = `[visual-shot] failed to start command: ${result.error}`;
    output = output ? `${output.replace(/\n$/, '')}\n${note}\n` : `${note}\n`;
  }

  const allLines = collapseCarriageReturns(normalizeNewlines(output));
  let rendered = allLines;
  let truncated = false;
  if (allLines.length > plan.maxLines) {
    truncated = true;
    rendered = allLines.slice(0, plan.maxLines);
  }
  let body = rendered.join('\n');
  if (truncated) body += `\n… ${allLines.length - plan.maxLines} more line(s) truncated`;
  const bodyHtml = ansiToHtml(body);

  try {
    await renderPng(plan, bodyHtml, ctx);
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError(`failed to render terminal image: ${e.message}`, 1);
  }

  const lines = rendered.length;
  const failed = plan.failOnError && (result.timedOut || exitCode === null || exitCode !== 0);

  if (plan.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          out: plan.out,
          command: plan.command,
          shell: plan.shell,
          exitCode: exitCode === null ? null : exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          lines,
          truncated,
          durationMs: result.durationMs,
        },
        null,
        2,
      ),
    );
  } else {
    const exitLabel = result.timedOut
      ? 'timeout'
      : exitCode === null
        ? `signal ${result.signal}`
        : exitCode;
    console.log(`saved ${plan.out}`);
    console.log(
      `term: exit ${exitLabel}, ${lines} line${lines === 1 ? '' : 's'}, ${result.durationMs}ms${truncated ? ` (truncated to ${plan.maxLines})` : ''}`,
    );
  }

  return failed ? 1 : 0;
}
