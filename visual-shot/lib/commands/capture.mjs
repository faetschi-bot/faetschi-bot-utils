import { resolve, join } from 'node:path';
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
} from '../config.mjs';
import { CliError } from '../errors.mjs';
import {
  ensureDir,
  launchBrowser,
  matchesAny,
  nonNegative,
  parseHeaders,
  positive,
  waitForServer,
} from '../shared.mjs';

export const name = 'capture';
export const aliases = ['shot', 'screenshot'];
export const summary = 'Screenshot a URL to a PNG (default command)';
export const needsBrowser = true;

export function usage() {
  return `visual-shot capture [options]   (also the default: visual-shot [options])

Options:
  --name <slug>        output file name, without extension (default: screenshot)
  --name-prefix <slug>  output prefix per --url when --url is repeated (default: screenshot)
  --out <path>         explicit output path (overrides --name and $VISUAL_OUT_DIR)
  --url <url>          page to open (repeatable; default: $VISUAL_URL or ${DEFAULT_URL})
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
  --wait-for-server    poll each --url until it responds before navigating
  --server-timeout <ms>  how long to wait for the server (default: ${DEFAULT_SERVER_TIMEOUT})
  --timeout <ms>       navigation timeout (default: ${DEFAULT_NAV_TIMEOUT})
  --retries <n>        retry a failed capture n times (default: 0, max ${MAX_RETRIES})
  --header <name:value>  extra HTTP header (repeatable)
  --storage-state <path>  Playwright storage state JSON (cookies/localStorage)
  --allow-console-error <pattern>  ignore matching console errors (repeatable, regex or substring)
  --ignore-console     ignore all console errors (page errors still fail)
  --json               print a machine-readable result object
  --help               show this help

With one --url the JSON result is a single capture object. With two or more it
is { ok, captures: [...] } and files are numbered from --name-prefix
(e.g. screenshot-1.png, screenshot-2.png); all URLs share one browser launch.`;
}

export function parse(argv) {
  const o = { urls: [], hover: [], click: [], key: [], allowConsoleError: [], header: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--name') o.name = val();
    else if (a === '--name-prefix') o.namePrefix = val();
    else if (a === '--out') o.out = val();
    else if (a === '--url') o.urls.push(val());
    else if (a === '--viewport') o.viewport = val();
    else if (a === '--scale') o.scale = val();
    else if (a === '--device') o.device = val();
    else if (a === '--wait-for') o.waitFor = val();
    else if (a === '--wait') o.wait = val();
    else if (a === '--hover') o.hover.push(val());
    else if (a === '--click') o.click.push(val());
    else if (a === '--key') o.key.push(val());
    else if (a === '--element') o.element = val();
    else if (a === '--full-page') o.fullPage = true;
    else if (a === '--wait-for-server') o.waitForServer = true;
    else if (a === '--server-timeout') o.serverTimeout = val();
    else if (a === '--timeout') o.timeout = val();
    else if (a === '--retries') o.retries = val();
    else if (a === '--header') o.header.push(val());
    else if (a === '--storage-state') o.storageState = val();
    else if (a === '--allow-console-error') o.allowConsoleError.push(val());
    else if (a === '--ignore-console') o.ignoreConsole = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new CliError(`Unknown option: ${a}`);
  }
  return o;
}

export function validate(opts) {
  const urls = opts.urls && opts.urls.length > 0 ? opts.urls : [process.env.VISUAL_URL || DEFAULT_URL];
  const multi = urls.length > 1;
  if (multi && opts.out) {
    throw new CliError('--out cannot be used with multiple --url; files are numbered from --name-prefix');
  }
  if (multi && opts.name) {
    throw new CliError('--name cannot be used with multiple --url; use --name-prefix');
  }
  const prefix = opts.namePrefix || 'screenshot';
  if (!/^[A-Za-z0-9._-]+$/.test(prefix)) {
    throw new CliError(`invalid --name-prefix "${prefix}" (letters, digits, dot, dash, underscore)`);
  }
  const outDir = process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR;
  const jobs = urls.map((url, i) => ({
    url,
    out: resolve(
      multi
        ? join(outDir, `${prefix}-${i + 1}.png`)
        : opts.out || join(outDir, `${opts.name || 'screenshot'}.png`),
    ),
  }));

  const [w, h] = (opts.viewport || DEFAULT_VIEWPORT).split('x').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new CliError(`invalid --viewport "${opts.viewport}" (expected WxH, e.g. 1280x720)`);
  }
  return {
    ...opts,
    jobs,
    single: !multi,
    name: multi ? prefix : opts.name || 'screenshot',
    width: w,
    height: h,
    scale: positive(opts.scale, DEFAULT_SCALE, 'scale'),
    wait: nonNegative(opts.wait, DEFAULT_WAIT, 'wait'),
    navTimeout: positive(opts.timeout, DEFAULT_NAV_TIMEOUT, 'timeout'),
    serverTimeout: positive(opts.serverTimeout, DEFAULT_SERVER_TIMEOUT, 'server-timeout'),
    retries: Math.min(MAX_RETRIES, nonNegative(opts.retries, 0, 'retries')),
    headers: parseHeaders(opts.header),
  };
}

async function attempt(browser, plan, job, contextOptions) {
  const context = await browser.newContext(contextOptions);
  try {
    const page = await context.newPage();
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

    await page.goto(job.url, { waitUntil: 'load', timeout: plan.navTimeout });
    if (plan.waitFor) await page.waitForSelector(plan.waitFor, { timeout: plan.navTimeout });
    for (const sel of plan.hover) await page.hover(sel);
    for (const sel of plan.click) await page.click(sel);
    for (const k of plan.key) await page.keyboard.press(k);
    await page.waitForTimeout(plan.wait);

    if (plan.element) await page.locator(plan.element).screenshot({ path: job.out });
    else await page.screenshot({ path: job.out, fullPage: Boolean(plan.fullPage) });

    const ignored = [];
    const fatalConsole = [];
    for (const e of consoleErrors) {
      if (plan.ignoreConsole || matchesAny(e, plan.allowConsoleError)) ignored.push(e);
      else fatalConsole.push(e);
    }
    const truncated = consoleErrorCount > consoleErrors.length || pageErrorCount > pageErrors.length;
    return { fatalConsole, fatalPage: pageErrors, ignored, truncated, consoleErrorCount, pageErrorCount };
  } finally {
    await context.close();
  }
}

async function captureOne(browser, plan, job, contextOptions) {
  ensureDir(job.out);
  let lastError;
  for (let i = 0; i <= plan.retries; i++) {
    try {
      if (plan.waitForServer) await waitForServer(job.url, plan.serverTimeout);
      const result = await attempt(browser, plan, job, contextOptions);
      const failed = result.fatalConsole.length > 0 || result.fatalPage.length > 0;
      return {
        ok: !failed,
        out: job.out,
        url: job.url,
        ignoredConsoleErrors: result.ignored.length,
        consoleErrors: result.fatalConsole,
        pageErrors: result.fatalPage,
        truncated: result.truncated,
        consoleErrorCount: result.consoleErrorCount,
        pageErrorCount: result.pageErrorCount,
      };
    } catch (e) {
      lastError = e;
      if (i < plan.retries && !plan.json) {
        console.error(`[visual-shot] attempt ${i + 1} failed, retrying: ${e.message}`);
      }
    }
  }
  return { ok: false, out: job.out, url: job.url, error: lastError.message };
}

function jsonCapture(capture) {
  if (capture.error !== undefined) {
    return { ok: false, out: capture.out, url: capture.url, error: capture.error };
  }
  return {
    ok: capture.ok,
    out: capture.out,
    url: capture.url,
    ignoredConsoleErrors: capture.ignoredConsoleErrors,
    consoleErrors: capture.consoleErrors,
    pageErrors: capture.pageErrors,
    truncated: capture.truncated,
  };
}

export async function run(plan, ctx) {
  const { chromium, devices } = ctx;

  if (plan.device && !devices[plan.device]) {
    throw new CliError(
      `unknown --device "${plan.device}". Try: ${Object.keys(devices).slice(0, 5).join(', ')}, ...`,
    );
  }

  const contextOptions = { viewport: { width: plan.width, height: plan.height }, deviceScaleFactor: plan.scale };
  if (Object.keys(plan.headers).length > 0) contextOptions.extraHTTPHeaders = plan.headers;
  if (plan.storageState) contextOptions.storageState = plan.storageState;
  if (plan.device) {
    Object.assign(contextOptions, devices[plan.device]);
    if (plan.viewport) contextOptions.viewport = { width: plan.width, height: plan.height };
    if (plan.scale !== undefined) contextOptions.deviceScaleFactor = plan.scale;
  }

  const browser = await launchBrowser(chromium);
  const captures = [];
  try {
    for (const job of plan.jobs) {
      captures.push(await captureOne(browser, plan, job, contextOptions));
    }
  } finally {
    await browser.close();
  }

  const failed = captures.some((capture) => !capture.ok);

  if (plan.json) {
    if (plan.single) {
      console.log(JSON.stringify(jsonCapture(captures[0]), null, 2));
    } else {
      console.log(JSON.stringify({ ok: !failed, captures: captures.map(jsonCapture) }, null, 2));
    }
  } else if (plan.single) {
    const capture = captures[0];
    if (capture.error !== undefined) {
      console.error(`[visual-shot] capture failed: ${capture.error}`);
    } else {
      console.log(`saved ${capture.out}`);
      if (capture.truncated) {
        console.error(
          `[visual-shot] note: error lists truncated at ${MAX_ERRORS} (console: ${capture.consoleErrorCount}, page: ${capture.pageErrorCount})`,
        );
      }
      const errors = [...capture.consoleErrors, ...capture.pageErrors];
      if (errors.length > 0) {
        console.error('page errors:');
        for (const e of errors) console.error(`  ${e}`);
      }
    }
  } else {
    for (const capture of captures) {
      if (capture.error !== undefined) {
        console.error(`[visual-shot] capture failed for ${capture.url}: ${capture.error}`);
        continue;
      }
      console.log(`saved ${capture.out}`);
      const errors = [...capture.consoleErrors, ...capture.pageErrors];
      if (errors.length > 0) {
        console.error(`page errors on ${capture.url}:`);
        for (const e of errors) console.error(`  ${e}`);
      }
    }
  }
  return failed ? 1 : 0;
}
