// Git/repository helpers. All process access is confined here so the rest of
// the tool stays pure and testable.

import { execFileSync } from 'node:child_process';

/** Absolute path of the git work tree containing `dir`, or null. */
export function gitRoot(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** Remote URL for `name` (default origin), or null. */
export function gitRemoteUrl(dir, name = 'origin') {
  try {
    return execFileSync('git', ['remote', 'get-url', name], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Parse an SSH or HTTPS GitHub remote URL into `{ owner, repo, slug }`, or null.
 * Supports git@github.com:owner/repo.git, ssh://git@github.com/owner/repo.git,
 * and https://github.com/owner/repo(.git).
 */
export function parseGitHubRemote(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  const cleaned = url.trim().replace(/\.git$/, '');
  const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const [, owner, repo] = match;
  return { owner, repo, slug: `${owner}/${repo}` };
}

/** The GitHub owner/repo for a directory's origin remote, or null. */
export function repoSlug(dir) {
  const url = gitRemoteUrl(dir);
  return url ? parseGitHubRemote(url) : null;
}
