// Package metadata read from disk so the renderers never hardcode the hosting
// repository or the version. `package-info` is the only place that touches
// package.json, which keeps the tool agnostic about where it is published.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);

/** owner/repo parsed from the package `repository` field, or '' when absent. */
function parseRepo(repository) {
  const url = typeof repository === 'string' ? repository : repository?.url ?? '';
  const cleaned = url.replace(/^git\+/, '').replace(/\.git$/, '');
  const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)$/);
  return match ? `${match[1]}/${match[2]}` : '';
}

export const VERSION = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
export const HOMEPAGE = typeof pkg.homepage === 'string' ? pkg.homepage : '';
export const REPOSITORY = parseRepo(pkg.repository);
