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
import { ensureMermaid, initMermaid, renderMermaidInPage } from '../mermaid.mjs';
import { assembleRecap } from '../recap/assemble.mjs';
import { VISUAL_BLOCK_TYPES, filterRecapByTypes } from '../recap/filter.mjs';
import { renderRecapGfm } from '../recap/gfm.mjs';
import { collectGitDiff } from '../recap/git.mjs';
import { RECAP_CSP, TABS_PRINT_CSS, buildRecap, renderDocument } from '../recap/render.mjs';
import { BLOCK_TYPES, validateRecap } from '../recap/schema.mjs';
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
report (optionally a PNG) or to a GitHub-flavoured Markdown comment.
Reads an agent-authored recap JSON and/or a git diff.

Options:
  --from <file|->       recap JSON to render ("-" reads stdin)
  --diff <range>        git range (e.g. main...HEAD) to add a file map + patches
  --repo <dir>          repository for --diff (default: cwd)
  --asset-root <dir>    root confining local image reads (default: the --from
                        file's directory, else cwd for stdin/--diff-only)
  --format <html|gfm>   primary output: HTML report or GitHub Markdown comment
                        (default: html)
  --out <path>          primary output file (default: $VISUAL_OUT_DIR/recap.html
                        for html, $VISUAL_OUT_DIR/recap.md for gfm)
  --gfm-out <path>      also write a GitHub Markdown comment
  --html-out <path>     also write the HTML report
  --png                 also write a PNG of the report (html always; gfm only
                        when explicitly given)
  --png-out <path>      explicit PNG path (default: alongside --out)
  --png-filter <list>   filter only the PNG: block types, or "visuals"
                        (requires --png; --only/--visuals-only still shape
                        HTML and GFM)
  --report-url <url>    gfm: link to the rendered HTML report
  --image-url <url>     gfm: embed an image of the report
  --only <list>         render only these comma-separated block types
  --visuals-only        shorthand for --only ${VISUAL_BLOCK_TYPES.join(',')}
  --title <text>        override the recap title
  --theme <light|dark>  report theme (default: ${DEFAULT_RECAP_THEME})
  --width <px>          page width, ${MIN_RECAP_WIDTH}-${MAX_RECAP_WIDTH} (default: ${DEFAULT_RECAP_WIDTH})
  --scale <n>           device scale factor for the PNG, 1-${MAX_RECAP_SCALE} (default: ${DEFAULT_RECAP_SCALE})
  --no-highlight        skip highlight.js (code stays uncolored)
  --json                print a machine-readable result object
  --help                show this help

Non-redundant PR recaps: a GFM comment already reviews the text (files, diffs,
tables, JSON, and Mermaid render natively), so pair it with a PNG of only the
blocks a comment cannot render (wireframe/image/image-pair/diagram) instead of
the whole report. One run can now emit all surfaces:
  visual-shot recap --from recap.json --format gfm --out recap.md \\
    --png --png-filter visuals --json
  visual-shot recap --from recap.json --format html --out recap.html \\
    --gfm-out recap.md --png --png-filter visuals --json
Embed the PNG only when --json reports a non-null png; when no visual block
matches, png is null and no PNG is written.`;
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
    else if (a === '--format') o.format = val();
    else if (a === '--out') o.out = val();
    else if (a === '--gfm-out') o.gfmOut = val();
    else if (a === '--html-out') o.htmlOut = val();
    else if (a === '--png-out') o.pngOut = val();
    else if (a === '--png') o.png = true;
    else if (a === '--png-filter') o.pngFilter = val();
    else if (a === '--report-url') o.reportUrl = val();
    else if (a === '--image-url') o.imageUrl = val();
    else if (a === '--only') o.only = val();
    else if (a === '--visuals-only') o.visualsOnly = true;
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

// Container blocks are never filter targets: they are kept automatically when
// they still hold a matching child, so filtering by them is a user error.
const CONTAINER_BLOCK_TYPES = new Set(['columns', 'tabs']);

// Resolves a comma-separated type list into concrete types. Validates every
// requested type against the schema so a typo fails with exit 2 before any
// rendering.
function resolveTypes(value, flag) {
  const types = value.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  if (types.length === 0) throw new CliError(`${flag} requires at least one block type`);
  const unique = [...new Set(types)];
  const valid = [...BLOCK_TYPES].filter((t) => !CONTAINER_BLOCK_TYPES.has(t)).sort().join(', ');
  for (const type of unique) {
    if (CONTAINER_BLOCK_TYPES.has(type)) {
      throw new CliError(
        `${flag} cannot target the container type "${type}" (containers are kept when they hold a matching block)`,
      );
    }
    if (!BLOCK_TYPES.has(type)) {
      throw new CliError(`invalid ${flag} type "${type}" (valid types: ${valid})`);
    }
  }
  return unique;
}

// --only / --visuals-only shape the HTML and GFM outputs (null = no filter).
function resolveOnlyTypes(opts) {
  if (opts.only !== undefined && opts.visualsOnly) {
    throw new CliError('--only and --visuals-only cannot be combined');
  }
  if (opts.visualsOnly) return [...VISUAL_BLOCK_TYPES];
  if (opts.only === undefined) return null;
  return resolveTypes(opts.only, '--only');
}

// --png-filter shapes only the PNG, so a run can post the full GFM text next to
// a visuals-only image in one invocation.
function resolvePngFilterTypes(opts) {
  if (opts.pngFilter === undefined) return null;
  if (opts.pngFilter === 'visuals') return [...VISUAL_BLOCK_TYPES];
  return resolveTypes(opts.pngFilter, '--png-filter');
}

export function validate(opts) {
  if (!opts.from && !opts.diff) {
    throw new CliError('missing input (expected --from <file|-> and/or --diff <range>)');
  }
  const only = resolveOnlyTypes(opts);
  const pngFilter = resolvePngFilterTypes(opts);
  if (pngFilter && !opts.png) {
    throw new CliError('--png-filter requires --png');
  }
  const theme = opts.theme === undefined ? DEFAULT_RECAP_THEME : opts.theme;
  if (theme !== 'light' && theme !== 'dark') {
    throw new CliError(`invalid --theme "${opts.theme}" (expected light or dark)`);
  }
  const format = opts.format === undefined ? 'html' : opts.format;
  if (format !== 'html' && format !== 'gfm') {
    throw new CliError(`invalid --format "${opts.format}" (expected html or gfm)`);
  }
  const out = resolve(
    opts.out
      || join(process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR, format === 'gfm' ? 'recap.md' : 'recap.html'),
  );
  const pngOut = opts.pngOut
    ? resolve(opts.pngOut)
    : out.replace(/\.(html?|md)$/i, '') + '.png';
  const gfmOut = opts.gfmOut ? resolve(opts.gfmOut) : null;
  const htmlOut = opts.htmlOut ? resolve(opts.htmlOut) : null;

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
    gfmOut,
    htmlOut,
    png: Boolean(opts.png),
    pngOut,
    pngFilter,
    format,
    reportUrl: opts.reportUrl || null,
    imageUrl: opts.imageUrl || null,
    theme,
    width: boundedNumber(opts.width, DEFAULT_RECAP_WIDTH, MIN_RECAP_WIDTH, MAX_RECAP_WIDTH, 'width'),
    scale: boundedNumber(opts.scale, DEFAULT_RECAP_SCALE, 1, MAX_RECAP_SCALE, 'scale'),
    highlight: !opts.noHighlight,
    json: Boolean(opts.json),
    only,
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

async function openRenderBrowser(plan) {
  const cache = plan.cache;
  ensureProvisioned(cache, { json: plan.json });
  applyEnvFile(join(cache, 'env.sh'));
  const playwright = loadPlaywright(cache);
  if (!playwright || !playwright.chromium) throw new CliError('playwright not found. Run: visual-shot setup', 1);
  return launchBrowser(playwright.chromium);
}

// Renders one built recap in one page: bakes Mermaid and highlighting, then
// serializes the DOM and (optionally) screenshots it. The caller owns the
// browser so a run with several surfaces shares a single launch.
async function renderPage(browser, plan, built, { highlightAsset, png, pngPath }) {
  const page = await browser.newPage({
    viewport: { width: plan.width + 40, height: 900 },
    deviceScaleFactor: plan.scale,
  });
  try {
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
      const asset = await ensureMermaid(plan.cache);
      const theme = built.theme === 'dark' ? 'dark' : 'default';
      if (await initMermaid(page, { scriptSource: readFileSync(asset, 'utf8'), theme })) {
        for (const item of built.mermaid) {
          const rendered = await renderMermaidInPage(page, { id: `r-${item.id}`, source: item.source });
          if (rendered.error) {
            built.warnings.push(`mermaid render failed (${item.id}): ${rendered.error}`);
            continue;
          }
          await page.evaluate(({ id, svg }) => {
            const slot = document.querySelector(`[data-mermaid-id="${id}"]`);
            if (slot) slot.innerHTML = svg;
          }, { id: item.id, svg: rendered.svg });
        }
      } else {
        built.warnings.push('failed to load Mermaid into the page');
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
    if (png) {
      try {
        // Reveal every tab panel only for the screenshot, after serializing, so
        // the .html file keeps working tabs while the PNG holds all panels.
        await page.addStyleTag({ content: TABS_PRINT_CSS });
        // A collapsed JSON tree would screenshot as a row of `{...}` stubs, so
        // open every <details> for the capture only; the serialized .html keeps
        // the author's collapsedDepth.
        await page.evaluate(() => {
          document.querySelectorAll('#recap details').forEach((d) => { d.open = true; });
        });
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
          ensureDir(pngPath);
          await page.locator('#recap').screenshot({ path: pngPath });
          pngWritten = true;
        }
      } catch (e) {
        pngError = e.message;
      }
    }
    return { content, pngError, pngWritten };
  } finally {
    await page.close();
  }
}

function writeOutput(path, content) {
  try {
    ensureDir(path);
    writeFileSync(path, content);
  } catch (e) {
    throw new CliError(`cannot write output ${path}: ${e.message}`, 1);
  }
}

export async function run(plan, ctx) {
  plan.cache = ctx.cache;
  const { recap: assembled, warnings } = assembleRecap({
    from: plan.from,
    gitData: plan.gitData,
    title: plan.title,
    range: plan.range,
  });

  // --only / --visuals-only shape the text surfaces; --png-filter can shape the
  // PNG differently, so one run can post the full GFM text plus a small visual
  // companion without a second recap invocation.
  const recap = plan.only ? filterRecapByTypes(assembled, plan.only) : assembled;
  const pngRecap = plan.pngFilter ? filterRecapByTypes(assembled, plan.pngFilter) : recap;

  const primaryGfm = plan.format === 'gfm';
  const wantsHtml = plan.format === 'html' || Boolean(plan.htmlOut);
  const wantsGfm = plan.format === 'gfm' || Boolean(plan.gfmOut);
  let wantsPng = plan.png;

  // A --only/--visuals-only run that matches nothing writes no artifact. The
  // JSON still reports ok: true with blocks: 0 and png: null, which is how an
  // agent learns there is no visual companion to embed next to the GFM text.
  if (plan.only && recap.blocks.length === 0) {
    warnings.push(`no blocks matched --only ${plan.only.join(',')}; nothing rendered`);
    if (plan.json) {
      console.log(JSON.stringify({
        ok: true,
        format: primaryGfm ? 'gfm' : 'html',
        ...(primaryGfm ? { markdown: null } : { html: null }),
        png: null,
        theme: normalizeTheme(plan.theme),
        blocks: 0,
        ...(primaryGfm ? {} : { mermaid: 0, highlight: false }),
        only: plan.only,
        warnings,
      }, null, 2));
    } else {
      for (const warning of warnings) console.error(`[visual-shot] warning: ${warning}`);
    }
    return 0;
  }

  if (plan.pngFilter && pngRecap.blocks.length === 0) {
    warnings.push(`no blocks matched --png-filter ${plan.pngFilter.join(',')}; no PNG written`);
    wantsPng = false;
  }

  // gfm without any other surface is pure text: no build pass, no
  // highlight/mermaid assets, and no browser. The HTML path inlines local
  // images as data URIs, but a comment cannot carry those, so the GFM renderer
  // references image sources directly instead.
  if (primaryGfm && !wantsHtml && !wantsPng) {
    const markdown = renderRecapGfm(recap, { reportUrl: plan.reportUrl, imageUrl: plan.imageUrl });
    writeOutput(plan.out, markdown);
    if (plan.json) {
      console.log(JSON.stringify({
        ok: true,
        format: 'gfm',
        markdown: plan.out,
        png: null,
        theme: normalizeTheme(plan.theme),
        blocks: recap.blocks.length,
        only: plan.only,
        warnings,
      }, null, 2));
    } else {
      console.log(`saved ${plan.out}`);
      for (const warning of warnings) console.error(`[visual-shot] warning: ${warning}`);
    }
    return 0;
  }

  let highlightAsset = null;
  const htmlHasCode = wantsHtml && recapHasCode(recap.blocks);
  const pngHasCode = wantsPng && pngRecap !== recap && recapHasCode(pngRecap.blocks);
  if (plan.highlight && (htmlHasCode || pngHasCode)) {
    try {
      highlightAsset = await ensureHighlight(ctx.cache, plan.theme);
    } catch (e) {
      warnings.push(`${e.message} — rendering code without syntax highlighting`);
    }
  }

  const build = (source) => buildRecap(source, {
    theme: plan.theme,
    width: plan.width,
    extraCss: highlightAsset ? highlightAsset.css : '',
    assetRoot: plan.assetRoot,
    maxImageBytes: MAX_RECAP_IMAGE_BYTES,
  });

  const builtMain = wantsHtml ? build(recap) : null;
  const builtPng = wantsPng ? (builtMain && pngRecap === recap ? builtMain : build(pngRecap)) : null;

  // A browser pass is needed for the screenshot, and for HTML whose Mermaid
  // SVGs or highlighted code must be baked in. All pages share one launch.
  const htmlNeedsBake = Boolean(builtMain) && (builtMain.mermaid.length > 0 || Boolean(highlightAsset));
  const needBrowser = wantsPng || htmlNeedsBake;
  let mainContent = null;
  let pngOk = false;
  if (needBrowser) {
    const browser = await openRenderBrowser(plan);
    try {
      if (builtMain && builtPng === builtMain) {
        // One render serves both surfaces: serialize the DOM, then screenshot.
        const rendered = await renderPage(browser, plan, builtMain, {
          highlightAsset,
          png: wantsPng,
          pngPath: plan.pngOut,
        });
        mainContent = rendered.content;
        if (rendered.pngError) warnings.push(`PNG screenshot failed (HTML still written): ${rendered.pngError}`);
        pngOk = rendered.pngWritten;
      } else {
        if (htmlNeedsBake) {
          const rendered = await renderPage(browser, plan, builtMain, { highlightAsset, png: false });
          mainContent = rendered.content;
        }
        if (builtPng) {
          const rendered = await renderPage(browser, plan, builtPng, {
            highlightAsset,
            png: true,
            pngPath: plan.pngOut,
          });
          if (rendered.pngError) {
            warnings.push(`PNG screenshot failed${builtMain ? ' (HTML still written)' : ''}: ${rendered.pngError}`);
          }
          pngOk = rendered.pngWritten;
        }
      }
    } finally {
      await browser.close();
    }
  }
  // built.warnings collects render-pass findings (mermaid failures, a skipped
  // oversized PNG, rejected images), so merge after the browser pass.
  if (builtMain) warnings.push(...builtMain.warnings);
  if (builtPng && builtPng !== builtMain) warnings.push(...builtPng.warnings);

  // The GFM text may reference the PNG written above when no URL was supplied.
  const imageUrl = plan.imageUrl || (pngOk ? plan.pngOut : null);
  const markdown = wantsGfm ? renderRecapGfm(recap, { reportUrl: plan.reportUrl, imageUrl }) : null;
  const finalHtml = builtMain
    ? renderDocument({
        bodyHtml: mainContent ?? builtMain.body,
        css: builtMain.css,
        theme: plan.theme,
        width: plan.width,
        title: recap.title,
        csp: RECAP_CSP,
      })
    : null;

  const writtenPaths = new Set();
  const writeOnce = (path, content) => {
    if (!path || writtenPaths.has(path)) return;
    writtenPaths.add(path);
    writeOutput(path, content);
  };
  if (primaryGfm) writeOnce(plan.out, markdown);
  else writeOnce(plan.out, finalHtml);
  if (plan.gfmOut) writeOnce(plan.gfmOut, markdown);
  if (plan.htmlOut) writeOnce(plan.htmlOut, finalHtml);

  if (plan.json) {
    console.log(JSON.stringify({
      ok: true,
      format: primaryGfm ? 'gfm' : 'html',
      ...(primaryGfm ? { markdown: plan.out } : { html: plan.out }),
      ...(plan.gfmOut ? { gfmOut: plan.gfmOut } : {}),
      ...(plan.htmlOut ? { htmlOut: plan.htmlOut } : {}),
      png: pngOk ? plan.pngOut : null,
      theme: normalizeTheme(plan.theme),
      blocks: recap.blocks.length,
      ...(plan.pngFilter ? { pngFilter: plan.pngFilter, pngBlocks: pngRecap.blocks.length } : {}),
      ...(primaryGfm ? {} : { mermaid: builtMain ? builtMain.mermaid.length : 0, highlight: Boolean(highlightAsset) }),
      only: plan.only,
      warnings,
    }, null, 2));
  } else {
    for (const path of writtenPaths) console.log(`saved ${path}`);
    if (pngOk) console.log(`saved ${plan.pngOut}`);
    for (const warning of warnings) console.error(`[visual-shot] warning: ${warning}`);
  }
  return 0;
}
