import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  DEFAULT_OUT_DIR,
  DEFAULT_RECAP_SCALE,
  DEFAULT_RECAP_THEME,
  DEFAULT_RECAP_WIDTH,
} from '../config.mjs';
import { CliError } from '../errors.mjs';
import { ensureHighlight } from '../highlight.mjs';
import { ensureMermaid } from '../mermaid.mjs';
import { assembleRecap } from '../recap/assemble.mjs';
import { collectGitDiff } from '../recap/git.mjs';
import { buildRecap, renderDocument } from '../recap/render.mjs';
import { validateRecap } from '../recap/schema.mjs';
import { normalizeTheme } from '../recap/theme.mjs';
import { applyEnvFile, ensureDir, ensureProvisioned, launchBrowser, loadPlaywright, positive } from '../shared.mjs';

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
  --out <path>          output HTML (default: $VISUAL_OUT_DIR/recap.html)
  --png                 also write a PNG of the report
  --png-out <path>      explicit PNG path (default: alongside --out)
  --title <text>        override the recap title
  --theme <light|dark>  report theme (default: ${DEFAULT_RECAP_THEME})
  --width <px>          page width (default: ${DEFAULT_RECAP_WIDTH})
  --scale <n>           device scale factor for the PNG (default: ${DEFAULT_RECAP_SCALE})
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

function readRecapJson(source) {
  let text;
  if (source === '-') {
    text = readFileSync(0, 'utf8');
  } else {
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

  return {
    from,
    gitData,
    range: opts.diff || null,
    title: opts.title || null,
    out,
    png: Boolean(opts.png),
    pngOut,
    theme,
    width: positive(opts.width, DEFAULT_RECAP_WIDTH, 'width'),
    scale: positive(opts.scale, DEFAULT_RECAP_SCALE, 'scale'),
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
    if (plan.png) {
      try {
        const size = await page.evaluate(() => {
          const rect = document.getElementById('recap').getBoundingClientRect();
          return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
        });
        await page.setViewportSize({ width: Math.max(1, size.width), height: Math.max(1, size.height) });
        ensureDir(plan.pngOut);
        await page.locator('#recap').screenshot({ path: plan.pngOut });
      } catch (e) {
        pngError = e.message;
      }
    }
    return { content, pngError };
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
  });
  warnings.push(...built.warnings);

  const needBrowser = plan.png || built.mermaid.length > 0 || Boolean(highlightAsset);
  let finalHtml = built.html;
  let pngOk = false;
  if (needBrowser) {
    const { content, pngError } = await renderInBrowser(plan, built, highlightAsset);
    if (pngError) warnings.push(`PNG screenshot failed (HTML still written): ${pngError}`);
    else pngOk = plan.png;
    finalHtml = renderDocument({
      bodyHtml: content,
      css: built.css,
      theme: plan.theme,
      width: plan.width,
      title: recap.title,
    });
  }

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
