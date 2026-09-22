#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OUT_DIR,
  DEFAULT_SCALE,
  DEFAULT_URL,
  DEFAULT_VIEWPORT,
  DEFAULT_WAIT,
  cacheDir,
} from '../lib/config.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(here, '..', 'scripts');

function usage() {
  console.log(`visual-shot - reproducible headless-Chromium screenshots for PR review.

Usage:
  visual-shot setup                 provision Chromium + libraries, then exit
  visual-shot [options]             capture a screenshot

Options:
  --name <slug>        output file name, without extension (default: screenshot)
  --out <path>         explicit output path (overrides --name and $VISUAL_OUT_DIR)
  --url <url>          page to open (default: $VISUAL_URL or ${DEFAULT_URL})
  --viewport <WxH>     viewport size (default: ${DEFAULT_VIEWPORT})
  --scale <n>          device scale factor (default: ${DEFAULT_SCALE})
  --wait-for <sel>     wait for this selector before capturing
  --wait <ms>          extra settle time after load (default: ${DEFAULT_WAIT})
  --hover <sel>        hover a selector (repeatable, in order)
  --click <sel>        click a selector (repeatable, in order)
  --key <key>          press a key (repeatable, in order)
  --element <sel>      capture only this element instead of the viewport
  --full-page          capture the full scrollable page
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
  const o = { hover: [], click: [], key: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'setup' && o.command === undefined) {
      o.command = 'setup';
      continue;
    }
    const val = () => {
      const v = argv[++i];
      if (v === undefined) {
        console.error(`Missing value for ${a}`);
        process.exit(2);
      }
      return v;
    };
    if (a === '--name') o.name = val();
    else if (a === '--out') o.out = val();
    else if (a === '--url') o.url = val();
    else if (a === '--viewport') o.viewport = val();
    else if (a === '--scale') o.scale = Number(val());
    else if (a === '--wait-for') o.waitFor = val();
    else if (a === '--wait') o.wait = Number(val());
    else if (a === '--hover') o.hover.push(val());
    else if (a === '--click') o.click.push(val());
    else if (a === '--key') o.key.push(val());
    else if (a === '--element') o.element = val();
    else if (a === '--full-page') o.fullPage = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    }
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

const opts = parse(process.argv.slice(2));
if (opts.help) {
  usage();
  process.exit(0);
}

const cache = cacheDir();
process.env.VISUAL_SHOT_CACHE = cache;

if (opts.command === 'setup' || !existsSync(join(cache, '.provisioned'))) {
  if (opts.command !== 'setup') {
    console.error('[visual-shot] first run: provisioning Chromium + libraries (this can take a few minutes)...');
  }
  const r = spawnSync('bash', [join(scriptsDir, 'provision.sh')], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (opts.command === 'setup') process.exit(0);
applyEnvFile(join(cache, 'env.sh'));

let chromium;
for (const candidate of ['playwright', join(cache, 'pw/node_modules/playwright')]) {
  try {
    chromium = require(candidate).chromium;
    break;
  } catch {
    /* try the next location */
  }
}
if (!chromium) {
  console.error('[visual-shot] playwright not found. Run: visual-shot setup');
  process.exit(1);
}

const url = opts.url || process.env.VISUAL_URL || DEFAULT_URL;
const name = opts.name || 'screenshot';
const out = resolve(opts.out || join(process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR, `${name}.png`));
const [w, h] = (opts.viewport || DEFAULT_VIEWPORT).split('x').map(Number);
const scale = opts.scale || DEFAULT_SCALE;
mkdirSync(dirname(out), { recursive: true });

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
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'load', timeout: 30000 });
if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 15000 });
for (const sel of opts.hover) await page.hover(sel);
for (const sel of opts.click) await page.click(sel);
for (const k of opts.key) await page.keyboard.press(k);
await page.waitForTimeout(opts.wait ?? DEFAULT_WAIT);

if (opts.element) await page.locator(opts.element).screenshot({ path: out });
else await page.screenshot({ path: out, fullPage: Boolean(opts.fullPage) });

await browser.close();
console.log(`saved ${out}`);
if (errors.length > 0) {
  console.error('page errors:');
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}
