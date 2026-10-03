import { readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  DEFAULT_OUT_DIR,
  DEFAULT_RECAP_SCALE,
  DEFAULT_RECAP_THEME,
  DEFAULT_RECAP_WIDTH,
  MAX_RECAP_IMAGE_BYTES,
  MAX_RECAP_PNG_HEIGHT,
  MAX_RECAP_SCALE,
  MAX_RECAP_SOURCE_BYTES,
  MAX_RECAP_WIDTH,
  MIN_RECAP_WIDTH,
} from '../config.mjs';
import { CliError } from '../errors.mjs';
import { ensureHighlight } from '../highlight.mjs';
import { ensureMermaid } from '../mermaid.mjs';
import { assembleRecap } from '../recap/assemble.mjs';
import { collectGitDiff } from '../recap/git.mjs';
import { RECAP_CSP, TABS_PRINT_CSS, buildRecap, renderDocument } from '../recap/render.mjs';
import { validateRecap } from '../recap/schema.mjs';
import { normalizeTheme } from '../recap/theme.mjs';
import { applyEnvFile, ensureDir, ensureProvisioned, launchBrowser, loadPlaywright } from '../shared.mjs';

export const name = 'recap';
export const summary = 'Render a visual recap (diff + fixtures) to HTML/PNG';
// The HTML-only path needs no Chromium, so this is not a needsBrowser command;
// run() provisions lazily only when mermaid, highlighting, or --png require it.
export const needsBrowser = false;

export function usage() {
  return `visual-shot recap --from <file|-> [--diff <range>] [options]

Render a visual recap — file map, annotated diffs, diagrams, schema/API
summaries, before/after screenshots, review notes — to a self-contained HTML
report (optionally a PNG). Reads an agent-authored recap JSON and/or a git diff.

Options:
  --from <file|->       recap JSON to render ("-" reads stdin)
  --diff <range>        git range (e.g. main...HEAD) to add a file map + patches
  --repo <dir>          repository for --diff (default: cwd)
  --asset-root <dir>    root confining local image reads (default: the --from
                        file's directory, else cwd for stdin/--diff-only)
  --out <path>          output HTML (default: $VISUAL_OUT_DIR/recap.html)
  --png                 also write a PNG of the report
  --png-out <path>      explicit PNG path (default: alongside --out)
  --title <text>        override the recap title
  --theme <light|dark>  report theme (default: ${DEFAULT_RECAP_THEME})
  --width <px>          page width, ${MIN_RECAP_WIDTH}-${MAX_RECAP_WIDTH} (default: ${DEFAULT_RECAP_WIDTH})
  --scale <n>           device scale factor for the PNG, 1-${MAX_RECAP_SCALE} (default: ${DEFAULT_RECAP_SCALE})
  --no-highlight        skip highlight.js (code stays uncolored)
  --json                print a machine-readable result object
  --help                show this help`;
}

export function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--from') o.from = val();
    else if (a === '--diff') o.diff = val();
    else if (a === '--repo') o.repo = val();
    else if (a === '--asset-root') o.assetRoot = val();
    else if (a === '--out') o.out = val();
    else if (a === '--png-out') o.pngOut = val();
    else if (a === '--png') o.png = true;
    else if (a === '--title') o.title = val();
    else if (a === '--theme') o.theme = val();
    else if (a === '--width') o.width = val();
    else if (a === '--scale') o.scale = val();
    else if (a === '--no-highlight') o.noHighlight = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new CliError(`Unknown option: ${a}`);
  }
  return o;
}

// Bounded range check for numeric flags: rejects NaN and anything outside
// [min, max] with a message that names the flag and the accepted range.
function boundedNumber(value, fallback, min, max, flag) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new CliError(`--${flag} must be between ${min} and ${max} (got ${value})`);
  }
  return n;
}

const STDIN_CHUNK = 64 * 1024;

// Read stdin without loading an unbounded amount into memory: pull fixed-size
// chunks until EOF and bail once the cap is passed. readFileSync(0) would read
// all of a hostile stream before the size check could run.
function readStdinBounded(maxBytes, what) {
  const chunks = [];
  let total = 0;
  const buf = Buffer.allocUnsafe(STDIN_CHUNK);
  for (;;) {
    let n;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === 'EAGAIN') continue;
      throw new CliError(`cannot read ${what} from stdin: ${e.message}`);
    }
    if (n === 0) break;
    total += n;
    if (total > maxBytes) {
      throw new CliError(`${what} on stdin exceeds ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function readRecapJson(source) {
  let text;
  if (source === '-') {
    text = readStdinBounded(MAX_RECAP_SOURCE_BYTES, 'recap JSON');
  } else {
    let stat;
    try {
      stat = statSync(source);
    } catch (e) {
      throw new CliError(`cannot read recap JSON ${source}: ${e.message}`);
    }
    // A character device (/dev/zero), FIFO, or directory would otherwise bypass
    // the size cap (or read unbounded), so require a regular file first.
    if (!stat.isFile()) {
      throw new CliError(`--from must be a regular file: ${source}`);
    }
    const size = stat.size;
    if (size > MAX_RECAP_SOURCE_BYTES) {
      throw new CliError(
        `recap JSON ${source} is too large (${size} > ${MAX_RECAP_SOURCE_BYTES} bytes)`,
      );
    }
    try {
      text = readFileSync(source, 'utf8');
    } catch (e) {
      throw new CliError(`cannot read recap JSON ${source}: ${e.message}`);
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new CliError(`recap JSON is not valid JSON: ${e.message}`);
  }
  const { ok, errors } = validateRecap(parsed);
  if (!ok) throw new CliError(`invalid recap JSON:\n  - ${errors.join('\n  - ')}`);
  return parsed;
}

export function validate(opts) {
  if (!opts.from && !opts.diff) {
    throw new CliError('missing input (expected --from <file|-> and/or --diff <range>)');
  }
  const theme = opts.theme === undefined ? DEFAULT_RECAP_THEME : opts.theme;
  if (theme !== 'light' && theme !== 'dark') {
    throw new CliError(`invalid --theme "${opts.theme}" (expected light or dark)`);
  }
  const out = resolve(opts.out || join(process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR, 'recap.html'));
  const pngOut = opts.pngOut
    ? resolve(opts.pngOut)
    : out.replace(/\.html?$/i, '') + '.png';

  const from = opts.from ? readRecapJson(opts.from) : null;
  const gitData = opts.diff ? collectGitDiff({ repo: opts.repo, range: opts.diff }) : null;

  // Local image reads are confined to this root. The recap JSON's own directory
  // is the natural root when reading a file; stdin/--diff-only reports anchor on
  // cwd (or an explicit --asset-root).
  const fromPath = opts.from && opts.from !== '-' ? resolve(opts.from) : null;
  const assetRoot = opts.assetRoot
    ? resolve(opts.assetRoot)
    : fromPath
      ? dirname(fromPath)
      : process.cwd();

  return {
    from,
    gitData,
    range: opts.diff || null,
    title: opts.title || null,
    assetRoot,
    out,
    png: Boolean(opts.png),
    pngOut,
    theme,
    width: boundedNumber(opts.width, DEFAULT_RECAP_WIDTH, MIN_RECAP_WIDTH, MAX_RECAP_WIDTH, 'width'),
    scale: boundedNumber(opts.scale, DEFAULT_RECAP_SCALE, 1, MAX_RECAP_SCALE, 'scale'),
    highlight: !opts.noHighlight,
    json: Boolean(opts.json),
  };
}

function recapHasCode(blocks) {
  for (const block of blocks) {
    if (block.type === 'code' || block.type === 'annotated-code') return true;
    if (block.type === 'diff' && block.language) return true;
    for (const key of ['columns', 'tabs']) {
      const children = block[key];
      if (Array.isArray(children) && children.some((c) => Array.isArray(c.blocks) && recapHasCode(c.blocks))) {
        return true;
      }
    }
  }
  return false;
}

async function renderInBrowser(plan, built, highlightAsset) {
  const cache = plan.cache;
  ensureProvisioned(cache, { json: plan.json });
  applyEnvFile(join(cache, 'env.sh'));
  const playwright = loadPlaywright(cache);
  if (!playwright || !playwright.chromium) throw new CliError('playwright not found. Run: visual-shot setup', 1);

  const browser = await launchBrowser(playwright.chromium);
  try {
    const page = await browser.newPage({
      viewport: { width: plan.width + 40, height: 900 },
      deviceScaleFactor: plan.scale,
    });

    // The render pass must not egress: the recap JSON is untrusted, so a crafted
    // diagram/markdown <img> could beacon or SSRF from the headless browser.
    // Allow only inline (data:), navigation (about:), and local (file:) URLs and
    // abort everything else. The saved artifact still keeps remote <img> URLs —
    // that is a static-file concern, not a render-time one.
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (/^(data:|about:|file:)/i.test(url)) return route.continue();
      return route.abort();
    });

    await page.setContent(built.html, { waitUntil: 'load' });

    if (built.mermaid.length > 0) {
      const asset = await ensureMermaid(cache);
      await page.addScriptTag({ content: readFileSync(asset, 'utf8') });
      await page.evaluate((theme) => {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'strict',
        });
      }, built.theme);
      for (const item of built.mermaid) {
        const result = await page.evaluate(async ({ id, source }) => {
          try {
            const { svg } = await window.mermaid.render(`r-${id}`, source);
            const slot = document.querySelector(`[data-mermaid-id="${id}"]`);
            if (slot) slot.innerHTML = svg;
            return true;
          } catch (e) {
            return e && e.message ? e.message : String(e);
          }
        }, item);
        if (result !== true) built.warnings.push(`mermaid render failed (${item.id}): ${result}`);
      }
    }

    if (plan.highlight && highlightAsset) {
      await page.addScriptTag({ content: highlightAsset.script });
      // highlightAll() only scans `pre code`; recap diffs and annotated code
      // are line-level inline <code>, so highlight every language-tagged block.
      await page.evaluate(() => {
        if (!window.hljs) return;
        document.querySelectorAll('code[class*="language-"]').forEach((el) => {
          if (!el.dataset.highlighted) window.hljs.highlightElement(el);
        });
      });
    }

    // Serialize the rendered DOM first: the report is self-contained (mermaid
    // SVGs + highlighted spans are now inline), and a large PNG can crash the
    // renderer, which must not cost us the HTML artifact.
    const content = await page.evaluate(() => document.getElementById('recap').innerHTML);
    let pngError = null;
    let pngWritten = false;
    if (plan.png) {
      try {
        // Reveal every tab panel only for the screenshot, after serializing, so
        // the .html file keeps working tabs while the PNG holds all panels.
        await page.addStyleTag({ content: TABS_PRINT_CSS });
        const size = await page.evaluate(() => {
          const rect = document.getElementById('recap').getBoundingClientRect();
          return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
        });
        // The screenshot is captured at deviceScaleFactor = plan.scale, so the
        // emitted PNG has scale× the CSS-pixel height. Cap the device-pixel
        // height, otherwise --scale 4 could still emit a ~4× oversized image.
        const deviceHeight = Math.ceil(size.height * plan.scale);
        if (deviceHeight > MAX_RECAP_PNG_HEIGHT) {
          built.warnings.push(
            `PNG skipped: report too tall (${deviceHeight}px at scale ${plan.scale} > ${MAX_RECAP_PNG_HEIGHT}px)`,
          );
        } else {
          await page.setViewportSize({ width: Math.max(1, size.width), height: Math.max(1, size.height) });
          ensureDir(plan.pngOut);
          await page.locator('#recap').screenshot({ path: plan.pngOut });
          pngWritten = true;
        }
      } catch (e) {
        pngError = e.message;
      }
    }
    return { content, pngError, pngWritten };
  } finally {
    await browser.close();
  }
}

export async function run(plan, ctx) {
  plan.cache = ctx.cache;
  const { recap, warnings } = assembleRecap({
    from: plan.from,
    gitData: plan.gitData,
    title: plan.title,
    range: plan.range,
  });

  let highlightAsset = null;
  if (plan.highlight && recapHasCode(recap.blocks)) {
    try {
      highlightAsset = await ensureHighlight(ctx.cache, plan.theme);
    } catch (e) {
      warnings.push(`${e.message} — rendering code without syntax highlighting`);
    }
  }
  const built = buildRecap(recap, {
    theme: plan.theme,
    width: plan.width,
    extraCss: highlightAsset ? highlightAsset.css : '',
    assetRoot: plan.assetRoot,
    maxImageBytes: MAX_RECAP_IMAGE_BYTES,
  });

  const needBrowser = plan.png || built.mermaid.length > 0 || Boolean(highlightAsset);
  let finalHtml;
  let pngOk = false;
  if (needBrowser) {
    const { content, pngError, pngWritten } = await renderInBrowser(plan, built, highlightAsset);
    if (pngError) warnings.push(`PNG screenshot failed (HTML still written): ${pngError}`);
    pngOk = pngWritten;
    finalHtml = renderDocument({
      bodyHtml: content,
      css: built.css,
      theme: plan.theme,
      width: plan.width,
      title: recap.title,
      csp: RECAP_CSP,
    });
  } else {
    // No browser pass: the built body is already final, but the saved file must
    // still carry the CSP. The initial render shell (built.html) intentionally
    // has none because the browser pass injects inline scripts.
    finalHtml = renderDocument({
      bodyHtml: built.body,
      css: built.css,
      theme: plan.theme,
      width: plan.width,
      title: recap.title,
      csp: RECAP_CSP,
    });
  }
  // built.warnings also collects render-pass findings (mermaid failures, a
  // skipped oversized PNG, rejected images), so merge after the browser pass.
  warnings.push(...built.warnings);

  try {
    ensureDir(plan.out);
    writeFileSync(plan.out, finalHtml);
  } catch (e) {
    throw new CliError(`cannot write output ${plan.out}: ${e.message}`, 1);
  }

  if (plan.json) {
    console.log(JSON.stringify({
      ok: true,
      html: plan.out,
      png: pngOk ? plan.pngOut : null,
      theme: normalizeTheme(plan.theme),
      blocks: recap.blocks.length,
      mermaid: built.mermaid.length,
      highlight: Boolean(highlightAsset),
      warnings,
    }, null, 2));
  } else {
    console.log(`saved ${plan.out}`);
    if (pngOk) console.log(`saved ${plan.pngOut}`);
    for (const warning of warnings) console.error(`[visual-shot] warning: ${warning}`);
  }
  return 0;
}
