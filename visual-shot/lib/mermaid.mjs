import { join } from 'node:path';
import { assetSha256, mermaidVersion } from './config.mjs';
import { downloadVerified, usableCachedAsset } from './shared.mjs';

// Single source of truth for the pinned Mermaid asset, shared by the `diagram`
// and `recap` commands so the version pin and cache path cannot drift.
export function mermaidAssetPath(cache) {
  return join(cache, 'mermaid', `mermaid-${mermaidVersion()}.min.js`);
}

export async function ensureMermaid(cache) {
  const asset = mermaidAssetPath(cache);
  const url = `https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion()}/dist/mermaid.min.js`;
  const expected = assetSha256(url);
  if (usableCachedAsset(asset, expected)) return asset;
  await downloadVerified(url, asset, expected, `Mermaid ${mermaidVersion()}`);
  return asset;
}

// Shared browser bake for the `diagram` and `recap` commands. Loads the pinned
// script and initializes Mermaid with `startOnLoad: false` (the caller renders
// explicitly) and `securityLevel: 'strict'` (labels must not run as HTML).
// Returns false when the script did not define `window.mermaid`, so each command
// can apply its own error policy.
export async function initMermaid(page, { scriptSource, theme }) {
  await page.addScriptTag({ content: scriptSource });
  const hasMermaid = await page.evaluate(() => typeof window.mermaid !== 'undefined');
  if (!hasMermaid) return false;
  await page.evaluate((value) => {
    window.mermaid.initialize({ startOnLoad: false, theme: value, securityLevel: 'strict' });
  }, theme);
  return true;
}

// Renders one definition in the page. Returns `{ svg }` on success or
// `{ error }` when Mermaid rejects the source, so the caller decides whether to
// throw (diagram) or collect a warning and continue (recap).
export async function renderMermaidInPage(page, { id, source }) {
  return page.evaluate(async ({ id, source }) => {
    try {
      const { svg } = await window.mermaid.render(id, source);
      return { svg };
    } catch (e) {
      return { error: e && e.message ? e.message : String(e) };
    }
  }, { id, source });
}
