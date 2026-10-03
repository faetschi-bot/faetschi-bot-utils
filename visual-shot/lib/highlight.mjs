import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { highlightVersion } from './config.mjs';
import { CliError } from './errors.mjs';
import { downloadFile } from './shared.mjs';

// highlight.js is pinned and cached like mermaid: fetched once into
// $VISUAL_SHOT_CACHE/highlight/, then offline. The browser bundle carries the
// common language set, so a recap does not need per-language assets.
const CDN = 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets';

export function highlightAssetPath(cache) {
  return join(cache, 'highlight', `highlight-${highlightVersion()}.min.js`);
}

function themeAssetPath(cache, theme) {
  return join(cache, 'highlight', `${theme}-${highlightVersion()}.min.css`);
}

export function highlightCssPath(cache, theme) {
  return themeAssetPath(cache, theme === 'dark' ? 'github-dark' : 'github');
}

const MIN_ASSET_BYTES = 1000;

function cached(file) {
  try {
    return existsSync(file) && statSync(file).size >= MIN_ASSET_BYTES;
  } catch {
    return false;
  }
}

async function fetchAsset(url, dest, what) {
  if (cached(dest)) return;
  try {
    await downloadFile(url, dest);
  } catch (e) {
    throw new CliError(`failed to download ${what} from ${url}: ${e.message}`, 1);
  }
}

// Returns { script, css } as file contents for the requested theme. Throws a
// CliError when an asset cannot be fetched, so the command can fall back to
// unhighlighted code with a warning.
export async function ensureHighlight(cache, theme) {
  const version = highlightVersion();
  const scriptPath = highlightAssetPath(cache);
  const cssPath = highlightCssPath(cache, theme);
  const themeName = theme === 'dark' ? 'github-dark' : 'github';
  await fetchAsset(`${CDN}@${version}/highlight.min.js`, scriptPath, 'highlight.js');
  await fetchAsset(`${CDN}@${version}/styles/${themeName}.min.css`, cssPath, `${themeName} theme`);
  return { script: readFileSync(scriptPath, 'utf8'), css: readFileSync(cssPath, 'utf8') };
}
