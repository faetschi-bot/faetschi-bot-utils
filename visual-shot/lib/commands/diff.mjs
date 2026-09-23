import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import {
  DEFAULT_DIFF_THRESHOLD,
  DEFAULT_NAV_TIMEOUT,
  DEFAULT_OUT_DIR,
  DEFAULT_VIEWPORT,
} from '../config.mjs';
import { CliError } from '../errors.mjs';
import { ensureDir, launchBrowser } from '../shared.mjs';

export const name = 'diff';
export const aliases = ['image-diff'];
export const summary = 'Compare two images (paths or URLs) and write a diff PNG';
export const needsBrowser = true;

const DEFAULT_DIFF_SCALE_VALUE = 1;

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

export function usage() {
  return `visual-shot diff <before> <after> [options]

Compare two images and write a side-by-side (before | after | diff) PNG.
Each input is a local image path or an http(s):// URL.

Options:
  --out <path>         explicit output PNG (default: $VISUAL_OUT_DIR/diff.png)
  --threshold <n>      per-pixel color distance threshold, 0..1 (default: ${DEFAULT_DIFF_THRESHOLD})
  --viewport <WxH>     viewport for URL inputs (default: ${DEFAULT_VIEWPORT})
  --scale <n>          device scale factor for URL inputs (default: ${DEFAULT_DIFF_SCALE_VALUE})
  --fail-on-diff       exit 1 when any differing pixels are found
  --json               print a machine-readable result object
  --help               show this help`;
}

export function parse(argv) {
  const o = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--out') o.out = val();
    else if (a === '--threshold') o.threshold = val();
    else if (a === '--viewport') o.viewport = val();
    else if (a === '--scale') o.scale = val();
    else if (a === '--fail-on-diff') o.failOnDiff = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('-')) throw new CliError(`Unknown option: ${a}`);
    else positionals.push(a);
  }
  if (positionals.length > 2) throw new CliError(`Unexpected argument: ${positionals[2]}`);
  o.before = positionals[0];
  o.after = positionals[1];
  return o;
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

export function validate(opts) {
  const threshold = opts.threshold === undefined ? DEFAULT_DIFF_THRESHOLD : Number(opts.threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new CliError(`--threshold must be a number between 0 and 1 (got ${opts.threshold})`);
  }

  const viewport = opts.viewport || DEFAULT_VIEWPORT;
  const [width, height] = viewport.split('x').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new CliError(`invalid --viewport "${opts.viewport}" (expected WxH, e.g. 1280x720)`);
  }

  const scale = opts.scale === undefined ? DEFAULT_DIFF_SCALE_VALUE : Number(opts.scale);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new CliError(`--scale must be greater than 0 (got ${opts.scale})`);
  }

  if (!opts.before || !opts.after) {
    throw new CliError('missing inputs: expected <before> and <after>');
  }

  for (const input of [opts.before, opts.after]) {
    if (!isUrl(input) && !existsSync(input)) {
      throw new CliError(`input not found: ${input}`);
    }
  }

  const out = resolve(opts.out || join(process.env.VISUAL_OUT_DIR || DEFAULT_OUT_DIR, 'diff.png'));

  return {
    before: opts.before,
    after: opts.after,
    out,
    threshold,
    width,
    height,
    scale,
    failOnDiff: Boolean(opts.failOnDiff),
    json: Boolean(opts.json),
  };
}

// Runs inside the browser page. Must be self-contained (page.evaluate serializes
// it by source), so all helpers live inside.
function compareInPage({ before, after, threshold }) {
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('failed to decode image'));
      img.src = src;
    });
  }

  function colorDelta(d1, d2, k) {
    let r1 = d1[k];
    let g1 = d1[k + 1];
    let b1 = d1[k + 2];
    let a1 = d1[k + 3];
    let r2 = d2[k];
    let g2 = d2[k + 1];
    let b2 = d2[k + 2];
    let a2 = d2[k + 3];
    if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0;
    if (a1 < 255) {
      a1 /= 255;
      r1 = 255 + (r1 - 255) * a1;
      g1 = 255 + (g1 - 255) * a1;
      b1 = 255 + (b1 - 255) * a1;
    }
    if (a2 < 255) {
      a2 /= 255;
      r2 = 255 + (r2 - 255) * a2;
      g2 = 255 + (g2 - 255) * a2;
      b2 = 255 + (b2 - 255) * a2;
    }
    const y = 0.29889531 * (r1 - r2) + 0.58662247 * (g1 - g2) + 0.11448223 * (b1 - b2);
    const i = 0.59597799 * (r1 - r2) - 0.2741761 * (g1 - g2) - 0.32180189 * (b1 - b2);
    const q = 0.21147017 * (r1 - r2) - 0.52261711 * (g1 - g2) + 0.31114694 * (b1 - b2);
    const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
    return y > 0 ? -delta : delta;
  }

  return (async () => {
    const [imgA, imgB] = await Promise.all([loadImage(before), loadImage(after)]);
    const width = Math.max(imgA.naturalWidth, imgB.naturalWidth);
    const height = Math.max(imgA.naturalHeight, imgB.naturalHeight);
    const sizeMatch =
      imgA.naturalWidth === imgB.naturalWidth && imgA.naturalHeight === imgB.naturalHeight;

    function draw(img) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, width, height);
    }

    const a = draw(imgA);
    const b = draw(imgB);
    const maxDelta = 35215 * threshold * threshold;
    const totalPixels = width * height;

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffCtx = diffCanvas.getContext('2d');
    const diffData = diffCtx.createImageData(width, height);
    let changedPixels = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const delta = colorDelta(a.data, b.data, i);
      if (Math.abs(delta) > maxDelta) {
        changedPixels++;
        diffData.data[i] = 255;
        diffData.data[i + 1] = 0;
        diffData.data[i + 2] = 0;
        diffData.data[i + 3] = 255;
      } else {
        diffData.data[i] = 255;
        diffData.data[i + 1] = 255;
        diffData.data[i + 2] = 255;
        diffData.data[i + 3] = 255;
      }
    }
    diffCtx.putImageData(diffData, 0, 0);

    const composite = document.createElement('canvas');
    composite.width = width * 3;
    composite.height = height;
    const cx = composite.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, composite.width, composite.height);
    cx.drawImage(imgA, 0, 0);
    cx.drawImage(imgB, width, 0);
    cx.drawImage(diffCanvas, width * 2, 0);

    return {
      dataUrl: composite.toDataURL('image/png'),
      sizeMatch,
      changedPixels,
      totalPixels,
      width,
      height,
    };
  })();
}

async function loadInput(input, plan, browser) {
  if (!isUrl(input)) {
    let buf;
    try {
      buf = readFileSync(input);
    } catch (e) {
      throw new CliError(`cannot read input ${input}: ${e.message}`, 1);
    }
    const mime = MIME_BY_EXT[extname(input).toLowerCase()] || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }

  const context = await browser.newContext({
    viewport: { width: plan.width, height: plan.height },
    deviceScaleFactor: plan.scale,
  });
  try {
    const page = await context.newPage();
    await page.goto(input, { waitUntil: 'load', timeout: DEFAULT_NAV_TIMEOUT });
    const buf = await page.screenshot();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (e) {
    throw new CliError(`failed to load ${input}: ${e.message}`, 1);
  } finally {
    await context.close();
  }
}

export async function run(plan, ctx) {
  const browser = await launchBrowser(ctx.chromium);
  let result;
  try {
    const before = await loadInput(plan.before, plan, browser);
    const after = await loadInput(plan.after, plan, browser);
    const page = await browser.newPage();
    try {
      result = await page.evaluate(compareInPage, { before, after, threshold: plan.threshold });
    } catch (e) {
      throw new CliError(`comparison failed: ${e.message}`, 1);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const base64 = result.dataUrl.slice(result.dataUrl.indexOf(',') + 1);
  try {
    ensureDir(plan.out);
    writeFileSync(plan.out, Buffer.from(base64, 'base64'));
  } catch (e) {
    throw new CliError(`cannot write output ${plan.out}: ${e.message}`, 1);
  }

  const diffPercentage = result.totalPixels
    ? Number(((result.changedPixels / result.totalPixels) * 100).toFixed(4))
    : 0;
  const failed = plan.failOnDiff && result.changedPixels > 0;

  if (plan.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          out: plan.out,
          before: plan.before,
          after: plan.after,
          sizeMatch: result.sizeMatch,
          changedPixels: result.changedPixels,
          totalPixels: result.totalPixels,
          diffPercentage,
          threshold: plan.threshold,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`saved ${plan.out}`);
    console.log(
      `diff: ${diffPercentage.toFixed(2)}% (${result.changedPixels}/${result.totalPixels} px)`,
    );
    if (!result.sizeMatch) {
      console.error('[visual-shot] size mismatch: inputs padded to the common max size');
    }
  }

  return failed ? 1 : 0;
}
