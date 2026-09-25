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
  --help               show this help`;
}

export function parse(argv) {
  const o = { hover: [], click: [], key: [], allowConsoleError: [], header: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--name') o.name = val();
    else if (a === '--out') o.out = val();
    else if (a === '--url') o.url = val();
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
  const url = opts.url || process.env.VISUAL_URL || DEFAULT_URL;
  const name = opts.name || 'screenshot';
  const out = resolve(opts.out || join(process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR, `${name}.png`));
  const [w, h] = (opts.viewport || DEFAULT_VIEWPORT).split('x').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new CliError(`invalid --viewport "${opts.viewport}" (expected WxH, e.g. 1280x720)`);
  }
  return {
    ...opts,
    url,
    name,
    out,
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

export async function run(plan, ctx) {
  const { chromium, devices } = ctx;
  const { url, out, width, height, scale, wait, navTimeout, serverTimeout, retries, headers } = plan;

  if (plan.device && !devices[plan.device]) {
    throw new CliError(
      `unknown --device "${plan.device}". Try: ${Object.keys(devices).slice(0, 5).join(', ')}, ...`,
    );
  }

  const contextOptions = { viewport: { width, height }, deviceScaleFactor: scale };
  if (Object.keys(headers).length > 0) contextOptions.extraHTTPHeaders = headers;
  if (plan.storageState) contextOptions.storageState = plan.storageState;
  if (plan.device) {
    Object.assign(contextOptions, devices[plan.device]);
    if (plan.viewport) contextOptions.viewport = { width, height };
    if (plan.scale !== undefined) contextOptions.deviceScaleFactor = scale;
  }

  ensureDir(out);

  async function attempt() {
    const browser = await launchBrowser(chromium);
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
      if (plan.waitFor) await page.waitForSelector(plan.waitFor, { timeout: navTimeout });
      for (const sel of plan.hover) await page.hover(sel);
      for (const sel of plan.click) await page.click(sel);
      for (const k of plan.key) await page.keyboard.press(k);
      await page.waitForTimeout(wait);

      if (plan.element) await page.locator(plan.element).screenshot({ path: out });
      else await page.screenshot({ path: out, fullPage: Boolean(plan.fullPage) });

      const ignored = [];
      const fatalConsole = [];
      for (const e of consoleErrors) {
        if (plan.ignoreConsole || matchesAny(e, plan.allowConsoleError)) ignored.push(e);
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
      if (plan.waitForServer) await waitForServer(url, serverTimeout);
      result = await attempt();
      lastError = undefined;
      break;
    } catch (e) {
      lastError = e;
      if (i < retries && !plan.json) {
        console.error(`[visual-shot] attempt ${i + 1} failed, retrying: ${e.message}`);
      }
    }
  }

  if (lastError) {
    if (plan.json) {
      console.log(JSON.stringify({ ok: false, out, url, error: lastError.message }, null, 2));
    } else {
      console.error(`[visual-shot] capture failed: ${lastError.message}`);
    }
    return 1;
  }

  const failed = result.fatalConsole.length > 0 || result.fatalPage.length > 0;
  if (plan.json) {
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
  return failed ? 1 : 0;
}
