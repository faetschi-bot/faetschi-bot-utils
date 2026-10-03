import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mermaidVersion } from './config.mjs';
import { CliError } from './errors.mjs';
import { downloadFile } from './shared.mjs';

// Single source of truth for the pinned Mermaid asset, shared by the `diagram`
// and `recap` commands so the version pin and cache path cannot drift.
export function mermaidAssetPath(cache) {
  return join(cache, 'mermaid', `mermaid-${mermaidVersion()}.min.js`);
}

const MIN_MERMAID_BYTES = 1000;

export async function ensureMermaid(cache) {
  const asset = mermaidAssetPath(cache);
  if (existsSync(asset)) {
    try {
      if (statSync(asset).size >= MIN_MERMAID_BYTES) return asset;
    } catch {
      /* unreadable cache entry: fall through and re-download */
    }
  }
  const url = `https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion()}/dist/mermaid.min.js`;
  try {
    await downloadFile(url, asset);
  } catch (e) {
    throw new CliError(`failed to download Mermaid ${mermaidVersion()} from ${url}: ${e.message}`, 1);
  }
  return asset;
}
