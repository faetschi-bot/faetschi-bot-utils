#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_NAV_TIMEOUT,
  DEFAULT_OUT_DIR,
  DEFAULT_SCALE,
  DEFAULT_SERVER_TIMEOUT,
  DEFAULT_URL,
  DEFAULT_VIEWPORT,
  DEFAULT_WAIT,
  MAX_ERRORS,
  MAX_RETRIES,
  cacheDir,
} from '../lib/config.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(here, '..', 'scripts');

class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

function usage() {
  console.log(`visual-shot - reproducible headless-Chromium screenshots for PR review.

Usage:
  visual-shot setup                 provision Chromium + libraries, then exit
  visual-shot doctor [--json]       check the environment, then exit
  visual-shot [options]             capture a screenshot

Options:
  --name <slug>        output file name, without extension (default: screenshot)
  --out <path>         explicit output path (overrides --name and $VISUAL_OUT_DIR)
  --url <url>          page to open (default: $VISUAL_URL or ${DEFAULT_URL})
  --viewport <WxH>     viewport size (default: ${DEFAULT_VIEWPORT})
  --scale <n>          device scale factor (default: ${DEFAULT_SCALE})
  --device <name>      Playwright device preset, e.g. "iPhone 13"
  --wait-for <sel>     wait for this selector before capturing
  --wait <ms>          extra settle time after load (default: ${DEFAULT_WAIT})
  --hover <sel>        hover a selector (repeatable, in order)
  --click <sel>        click a selector (repeatable, in order)
  --key <key>          press a key (repeatable, in order)
  --element <sel>      capture only this element instead of the viewport
  --full-page          capture the full scrollable page
  --wait-for-server    poll --url until it responds before navigating
  --server-timeout <ms>  how long to wait for the server (default: ${DEFAULT_SERVER_TIMEOUT})
  --timeout <ms>       navigation timeout (default: ${DEFAULT_NAV_TIMEOUT})
  --retries <n>        retry a failed capture n times (default: 0, max ${MAX_RETRIES})
  --header <name:value>  extra HTTP header (repeatable)
  --storage-state <path>  Playwright storage state JSON (cookies/localStorage)
  --allow-console-error <pattern>  ignore matching console errors (repeatable, regex or substring)
  --ignore-console     ignore all console errors (page errors still fail)
  --json               print a machine-readable result object
  --help               show this help

Env:
  VISUAL_URL                        default page URL
  VISUAL_OUT_DIR                    default output directory (${DEFAULT_OUT_DIR})
  VISUAL_SHOT_CACHE                 persistent cache dir for Chromium + libs
  VISUAL_SHOT_PLAYWRIGHT_VERSION    pinned Playwright version

Output defaults to <VISUAL_OUT_DIR>/<name>.png. Commit that file to the PR branch
and reference its raw GitHub URL in the PR body.`);
}

function parse(argv) {
  const o = { hover: [], click: [], key: [], allowConsoleError: [], header: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === 'setup' || a === 'doctor') && o.command === undefined) {
      o.command = a;
      continue;
    }
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--name') o.name = val();
    else if (a === '--out') o.out = val();
    else if (a === '--url') o.url = val();
    else if (a === '--viewport') o.viewport = val();
    else if (a === '--scale') o.scale = Number(val());
    else if (a === '--device') o.device = val();
    else if (a === '--wait-for') o.waitFor = val();
    else if (a === '--wait') o.wait = Number(val());
    else if (a === '--hover') o.hover.push(val());
    else if (a === '--click') o.click.push(val());
    else if (a === '--key') o.key.push(val());
    else if (a === '--element') o.element = val();
    else if (a === '--full-page') o.fullPage = true;
    else if (a === '--wait-for-server') o.waitForServer = true;
    else if (a === '--server-timeout') o.serverTimeout = Number(val());
    else if (a === '--timeout') o.timeout = Number(val());
    else if (a === '--retries') o.retries = Number(val());
    else if (a === '--header') o.header.push(val());
    else if (a === '--storage-state') o.storageState = val();
    else if (a === '--allow-console-error') o.allowConsoleError.push(val());
    else if (a === '--ignore-console') o.ignoreConsole = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new CliError(`Unknown option: ${a}`);
  }
  return o;
}

function applyEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function findFile(root, name) {
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === name) return p;
    }
  }
  return null;
}

function loadPlaywright(cache) {
  for (const candidate of ['playwright', join(cache, 'pw/node_modules/playwright')]) {
    try {
      return require(candidate);
    } catch {
      /* try the next location */
    }
  }
  return null;
}

function parseHeaders(list) {
  const headers = {};
  for (const raw of list) {
    const idx = raw.indexOf(':');
    if (idx === -1) throw new CliError(`Invalid --header (expected "Name: value"): ${raw}`);
    headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  }
  return headers;
}

function matchesAny(text, patterns) {
  for (const p of patterns) {
    if (text.includes(p)) return true;
    try {
      if (new RegExp(p).test(text)) return true;
    } catch {
      /* not a valid regex and not a substring; ignore this pattern */
    }
  }
  return false;
}

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback, flag) {
  const n = num(value, fallback);
  if (n <= 0) throw new CliError(`--${flag} must be greater than 0 (got ${value})`);
  return n;
}

function nonNegative(value, fallback, flag) {
  const n = num(value, fallback);
  if (n < 0) throw new CliError(`--${flag} must not be negative (got ${value})`);
  return n;
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(5000, remaining)),
      });
      if (res.status < 500) return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `server not reachable at ${url} within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`,
  );
}

async function runDoctor(opts, cache) {
  const checks = [];
  const add = (name, ok, detail, hint) => checks.push({ name, ok, detail, hint });

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add('node', nodeMajor >= 20, `node ${process.version}`, 'Install Node 20 or newer.');

  add('cache', existsSync(cache), cache, 'Run: visual-shot setup');
  const provisioned = existsSync(join(cache, '.provisioned'));
  add('provisioned', provisioned, provisioned ? 'yes' : 'no', 'Run: visual-shot setup');

  const shell = findFile(join(cache, 'browsers'), 'headless_shell');
  add('chromium', Boolean(shell), shell || 'not found', 'Run: visual-shot setup');

  const pw = loadPlaywright(cache);
  add('playwright', Boolean(pw), pw ? 'resolvable' : 'not found', 'Run: visual-shot setup');

  const url = opts.url || process.env.VISUAL_URL;
  if (url) {
    let reachable = false;
    let detail = 'not reachable';
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      reachable = res.status < 500;
      detail = `HTTP ${res.status}`;
    } catch (e) {
      detail = e.message;
    }
    add('server', reachable, `${url} (${detail})`, 'Start your dev server, or pass --url.');
  }

  const ok = checks.every((c) => c.ok);
  if (opts.json) {
    console.log(JSON.stringify({ ok, cache, checks }, null, 2));
  } else {
    for (const c of checks) {
      console.log(`${c.ok ? '[ok]  ' : '[FAIL]'} ${c.name}: ${c.detail}`);
      if (!c.ok && c.hint) console.log(`        hint: ${c.hint}`);
    }
    console.log(ok ? '[visual-shot] environment ready' : '[visual-shot] environment not ready');
  }
  return ok;
}

async function capture(opts, cache) {
  const url = opts.url || process.env.VISUAL_URL || DEFAULT_URL;
  const name = opts.name || 'screenshot';
  const out = resolve(opts.out || join(process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR, `${name}.png`));

  const [w, h] = (opts.viewport || DEFAULT_VIEWPORT).split('x').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new CliError(`invalid --viewport "${opts.viewport}" (expected WxH, e.g. 1280x720)`);
  }
  const scale = positive(opts.scale, DEFAULT_SCALE, 'scale');
  const wait = nonNegative(opts.wait, DEFAULT_WAIT, 'wait');
  const navTimeout = positive(opts.timeout, DEFAULT_NAV_TIMEOUT, 'timeout');
  const serverTimeout = positive(opts.serverTimeout, DEFAULT_SERVER_TIMEOUT, 'server-timeout');
  const retries = Math.min(MAX_RETRIES, nonNegative(opts.retries, 0, 'retries'));
  const headers = parseHeaders(opts.header);

  if (opts.command === 'setup' || !existsSync(join(cache, '.provisioned'))) {
    if (opts.command !== 'setup') {
      console.error('[visual-shot] first run: provisioning Chromium + libraries (this can take a few minutes)...');
    }
    const r = spawnSync('bash', [join(scriptsDir, 'provision.sh')], { stdio: 'inherit', env: process.env });
    if (r.status !== 0) throw new CliError('provisioning failed', r.status ?? 1);
  }
  if (opts.command === 'setup') return;
  applyEnvFile(join(cache, 'env.sh'));

  const pw = loadPlaywright(cache);
  if (!pw || !pw.chromium) throw new CliError('playwright not found. Run: visual-shot setup', 1);
  const { chromium, devices } = pw;

  if (opts.device && !devices[opts.device]) {
    throw new CliError(
      `unknown --device "${opts.device}". Try: ${Object.keys(devices).slice(0, 5).join(', ')}, ...`,
    );
  }

  const contextOptions = { viewport: { width: w, height: h }, deviceScaleFactor: scale };
  if (Object.keys(headers).length > 0) contextOptions.extraHTTPHeaders = headers;
  if (opts.storageState) contextOptions.storageState = opts.storageState;
  if (opts.device) {
    Object.assign(contextOptions, devices[opts.device]);
    if (opts.viewport) contextOptions.viewport = { width: w, height: h };
    if (opts.scale !== undefined) contextOptions.deviceScaleFactor = scale;
  }

  try {
    mkdirSync(dirname(out), { recursive: true });
  } catch (e) {
    throw new CliError(`cannot create output directory ${dirname(out)}: ${e.message}`, 1);
  }

  async function attempt() {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    });
    try {
      const page = await browser.newPage(contextOptions);
      const consoleErrors = [];
      const pageErrors = [];
      let consoleErrorCount = 0;
      let pageErrorCount = 0;
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        consoleErrorCount++;
        if (consoleErrors.length < MAX_ERRORS) consoleErrors.push(m.text());
      });
      page.on('pageerror', (e) => {
        pageErrorCount++;
        if (pageErrors.length < MAX_ERRORS) pageErrors.push(String(e));
      });

      await page.goto(url, { waitUntil: 'load', timeout: navTimeout });
      if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: navTimeout });
      for (const sel of opts.hover) await page.hover(sel);
      for (const sel of opts.click) await page.click(sel);
      for (const k of opts.key) await page.keyboard.press(k);
      await page.waitForTimeout(wait);

      if (opts.element) await page.locator(opts.element).screenshot({ path: out });
      else await page.screenshot({ path: out, fullPage: Boolean(opts.fullPage) });

      const ignored = [];
      const fatalConsole = [];
      for (const e of consoleErrors) {
        if (opts.ignoreConsole || matchesAny(e, opts.allowConsoleError)) ignored.push(e);
        else fatalConsole.push(e);
      }
      const truncated = consoleErrorCount > consoleErrors.length || pageErrorCount > pageErrors.length;
      return { fatalConsole, fatalPage: pageErrors, ignored, truncated, consoleErrorCount, pageErrorCount };
    } finally {
      await browser.close();
    }
  }

  let lastError;
  let result;
  for (let i = 0; i <= retries; i++) {
    try {
      if (opts.waitForServer) await waitForServer(url, serverTimeout);
      result = await attempt();
      lastError = undefined;
      break;
    } catch (e) {
      lastError = e;
      if (i < retries && !opts.json) {
        console.error(`[visual-shot] attempt ${i + 1} failed, retrying: ${e.message}`);
      }
    }
  }

  if (lastError) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, out, url, error: lastError.message }, null, 2));
    } else {
      console.error(`[visual-shot] capture failed: ${lastError.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const failed = result.fatalConsole.length > 0 || result.fatalPage.length > 0;
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: !failed,
          out,
          url,
          ignoredConsoleErrors: result.ignored.length,
          consoleErrors: result.fatalConsole,
          pageErrors: result.fatalPage,
          truncated: result.truncated,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`saved ${out}`);
    if (result.truncated) {
      console.error(
        `[visual-shot] note: error lists truncated at ${MAX_ERRORS} (console: ${result.consoleErrorCount}, page: ${result.pageErrorCount})`,
      );
    }
    if (failed) {
      console.error('page errors:');
      for (const e of [...result.fatalConsole, ...result.fatalPage]) console.error(`  ${e}`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function main(opts) {
  const cache = cacheDir();
  process.env.VISUAL_SHOT_CACHE = cache;

  if (opts.command === 'doctor') {
    process.exitCode = (await runDoctor(opts, cache)) ? 0 : 1;
    return;
  }
  await capture(opts, cache);
}

let opts;
try {
  opts = parse(process.argv.slice(2));
  if (opts.help) usage();
  else await main(opts);
} catch (e) {
  const code = e instanceof CliError ? e.code : 1;
  const json = opts?.json ?? process.argv.includes('--json');
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: e.message }, null, 2) + '\n');
  } else {
    process.stderr.write(`[visual-shot] ${e.message}\n`);
  }
  process.exitCode = code;
}
