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

// A git range is passed as a bare argv element to `git diff`; a value that
// starts with "-" (or carries whitespace/control bytes) would be parsed as an
// option — e.g. `--output=/tmp/x` writes a file — so reject it up front.
export function assertValidRange(range) {
  if (typeof range !== 'string' || range.length === 0) {
    throw new CliError('--diff requires a git range, e.g. main...HEAD');
  }
  if (range.startsWith('-')) {
    throw new CliError(`invalid --diff range "${range}" (must not start with "-")`);
  }
  if (/[\s\u0000-\u001f\u007f]/.test(range)) {
    throw new CliError(`invalid --diff range "${range}" (must not contain whitespace or control characters)`);
  }
  return range;
}

// Truncate patch text to at most maxBytes UTF-8 bytes without splitting a code
// point, preferring the last newline inside the limit so the result ends on a
// line boundary. The marker is appended so a reader knows the patch is partial.
export function truncatePatch(text, maxBytes) {
  const value = String(text ?? '');
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  const buf = Buffer.from(value, 'utf8');
  let end = Math.min(maxBytes, buf.length);
  // Step back off a UTF-8 continuation byte (0b10xxxxxx) so a multi-byte code
  // point is never cut in half.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  let slice = buf.toString('utf8', 0, end);
  const newline = slice.lastIndexOf('\n');
  if (newline >= 0) slice = slice.slice(0, newline);
  return `${slice}\n… truncated\n`;
}

export function collectGitDiff({
  repo = process.cwd(),
  range,
  maxFiles = MAX_RECAP_PATCH_FILES,
  maxBytes = MAX_RECAP_PATCH_BYTES,
} = {}) {
  assertValidRange(range);

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
    patches.set(entry.path, truncatePatch(patch, maxBytes));
  }
  return {
    entries,
    patches,
    total: entries.length,
    truncated: entries.length > maxFiles,
  };
}
