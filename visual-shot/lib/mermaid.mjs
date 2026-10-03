import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assetSha256, mermaidVersion } from './config.mjs';
import { downloadVerified, verifyFileSha256 } from './shared.mjs';

// Single source of truth for the pinned Mermaid asset, shared by the `diagram`
// and `recap` commands so the version pin and cache path cannot drift.
export function mermaidAssetPath(cache) {
  return join(cache, 'mermaid', `mermaid-${mermaidVersion()}.min.js`);
}

const MIN_MERMAID_BYTES = 1000;

// A cached asset is usable only when it clears the size floor and still matches
// the pinned digest. A tampered or corrupted entry is discarded by
// re-downloading instead of being trusted.
function usableCached(asset, expectedSha256) {
  try {
    if (!existsSync(asset) || statSync(asset).size < MIN_MERMAID_BYTES) return false;
  } catch {
    return false;
  }
  if (expectedSha256 && !verifyFileSha256(asset, expectedSha256)) return false;
  return true;
}

export async function ensureMermaid(cache) {
  const asset = mermaidAssetPath(cache);
  const url = `https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion()}/dist/mermaid.min.js`;
  const expected = assetSha256(url);
  if (usableCached(asset, expected)) return asset;
  await downloadVerified(url, asset, expected, `Mermaid ${mermaidVersion()}`);
  return asset;
}
