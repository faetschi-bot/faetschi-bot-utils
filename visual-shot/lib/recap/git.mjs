import { spawnSync } from 'node:child_process';
import { MAX_RECAP_PATCH_BYTES, MAX_RECAP_PATCH_FILES } from '../config.mjs';
import { CliError } from '../errors.mjs';

// Mechanical input for a recap: the changed-file map and the raw patches. Used
// by `recap --diff` so a report exists even without an agent-authored JSON.

const CHANGE_BY_CODE = { A: 'added', M: 'modified', D: 'removed', R: 'renamed', C: 'renamed', T: 'modified' };

export function parseNameStatus(text) {
  const entries = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const code = (parts[0] ?? '')[0];
    const paths = parts.slice(1);
    const path = paths[paths.length - 1] ?? paths[0];
    if (!path) continue;
    entries.push({ path, change: CHANGE_BY_CODE[code] ?? 'modified' });
  }
  return entries;
}

export function collectGitDiff({
  repo = process.cwd(),
  range,
  maxFiles = MAX_RECAP_PATCH_FILES,
  maxBytes = MAX_RECAP_PATCH_BYTES,
} = {}) {
  if (!range) throw new CliError('--diff requires a git range, e.g. main...HEAD');

  const git = (args) => {
    const result = spawnSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw new CliError(`git ${args[0]} failed: ${result.error.message}`, 1);
    if (result.status !== 0) {
      const detail = (result.stderr || '').trim() || `exit ${result.status}`;
      throw new CliError(`git diff failed for "${range}": ${detail}`);
    }
    return result.stdout;
  };

  const entries = parseNameStatus(git(['diff', '--name-status', range]));
  const patches = new Map();
  for (const entry of entries.slice(0, maxFiles)) {
    const patch = git(['diff', '--no-color', '--unified=3', range, '--', entry.path]);
    patches.set(entry.path, patch.length > maxBytes ? `${patch.slice(0, maxBytes)}\n… truncated\n` : patch);
  }
  return {
    entries,
    patches,
    total: entries.length,
    truncated: entries.length > maxFiles,
  };
}
