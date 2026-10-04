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

// Split a multi-file `git diff` at each `diff --git` header into per-file patch
// text (one chunk per file, in git's output order).
function splitDiffByFile(text) {
  const chunks = [];
  let current = null;
  for (const line of String(text ?? '').split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) chunks.push(current.join('\n'));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) chunks.push(current.join('\n'));
  return chunks;
}

// Derive the `b/<new>` path from a chunk's `diff --git a/<old> b/<new>` header.
// Paths may contain spaces and renames swap the two sides, so the header is
// ambiguous on its own; every plausible split is collected and the caller's
// known selected paths disambiguate. `core.quotePath=false` is forced for the
// diff, so only truly unusual bytes (newlines, quotes) get quoted — those yield
// no candidate and make the caller fail loudly instead of mis-attaching a patch.
function newPathFromHeader(chunk, selectedPaths) {
  const firstLine = String(chunk ?? '').split('\n', 1)[0];
  const marker = 'diff --git ';
  if (!firstLine.startsWith(marker)) return null;
  const rest = firstLine.slice(marker.length);
  const candidates = [];
  let idx = rest.indexOf(' b/');
  while (idx !== -1) {
    const aSide = rest.slice(0, idx);
    const bSide = rest.slice(idx + 1);
    if (aSide.startsWith('a/') && bSide.startsWith('b/')) candidates.push(bSide.slice(2));
    idx = rest.indexOf(' b/', idx + 1);
  }
  if (candidates.length === 0) return null;
  return candidates.find((path) => selectedPaths.has(path)) ?? candidates[0];
}

export function collectGitDiff({
  repo = process.cwd(),
  range,
  maxFiles = MAX_RECAP_PATCH_FILES,
  maxBytes = MAX_RECAP_PATCH_BYTES,
} = {}) {
  assertValidRange(range);

  const git = (args) => {
    const result = spawnSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], {
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
  const selected = entries.slice(0, maxFiles);
  const patches = new Map();
  if (selected.length > 0) {
    // One subprocess for the whole range, but bounded to the files we keep:
    // git path-limits the diff to `selected`, so its output — and memory — scale
    // with the kept patches rather than the potentially huge full range.
    const selectedPaths = selected.map((entry) => entry.path);
    const chunks = splitDiffByFile(git(['diff', '--no-color', '--unified=3', range, '--', ...selectedPaths]));
    // Pair each chunk to its selected entry by the header's new path, not by
    // position, so a reordering (or rename) cannot silently mis-attach a patch.
    if (chunks.length !== selected.length) {
      throw new CliError(
        `git diff returned ${chunks.length} file patch(es) for ${selected.length} selected file(s) in "${range}"`,
      );
    }
    const selectedSet = new Set(selectedPaths);
    const byPath = new Map();
    for (const chunk of chunks) {
      const path = newPathFromHeader(chunk, selectedSet);
      if (!path || !selectedSet.has(path)) {
        throw new CliError(`could not pair a git diff patch with a changed file in "${range}"`);
      }
      if (byPath.has(path)) {
        throw new CliError(`git diff returned duplicate patches for "${path}" in "${range}"`);
      }
      byPath.set(path, chunk);
    }
    // Insert in `selected` order so the patch map mirrors the entry order.
    for (const entry of selected) {
      patches.set(entry.path, truncatePatch(byPath.get(entry.path), maxBytes));
    }
  }
  return {
    entries,
    patches,
    total: entries.length,
    truncated: entries.length > maxFiles,
  };
}
