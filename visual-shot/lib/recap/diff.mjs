import { CliError } from '../errors.mjs';

// Line-oriented diffing for recap blocks. Deterministic and dependency-free:
// the renderer must be able to rebuild the report from the same inputs offline.

const MAX_DP_CELLS = 4_000_000;

export function splitLines(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Longest-common-subsequence ops. Bounded because a recap excerpt is small by
// design; oversized inputs are rejected with an actionable message.
function lcsOps(a, b) {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_DP_CELLS) {
    throw new CliError(
      `diff is too large to align (${n} vs ${m} lines); split the excerpt into smaller diff blocks`,
    );
  }
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  const at = (i, j) => i * width + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = a[i] === b[j]
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'context', text: a[i] });
      i++;
      j++;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      ops.push({ type: 'removed', text: a[i] });
      i++;
    } else {
      ops.push({ type: 'added', text: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'removed', text: a[i++] });
  while (j < m) ops.push({ type: 'added', text: b[j++] });
  return ops;
}

function kindOf(row) {
  if (row.left && row.right) return row.left.text === row.right.text ? 'context' : 'changed';
  return row.left ? 'removed' : 'added';
}

// Pairs adjacent removed/added runs onto shared rows for side-by-side display.
function rowsFromOps(ops) {
  const rows = [];
  let beforeNo = 1;
  let afterNo = 1;
  let removed = [];
  let added = [];

  const flush = () => {
    const count = Math.max(removed.length, added.length);
    for (let k = 0; k < count; k++) {
      const row = {
        left: k < removed.length ? { n: beforeNo++, text: removed[k] } : null,
        right: k < added.length ? { n: afterNo++, text: added[k] } : null,
      };
      rows.push({ ...row, kind: kindOf(row) });
    }
    removed = [];
    added = [];
  };

  for (const op of ops) {
    if (op.type === 'removed') removed.push(op.text);
    else if (op.type === 'added') added.push(op.text);
    else {
      flush();
      const text = op.text;
      rows.push({
        left: { n: beforeNo++, text },
        right: { n: afterNo++, text },
        kind: 'context',
      });
    }
  }
  flush();
  return rows;
}

function unifiedFromOps(ops) {
  let beforeNo = 1;
  let afterNo = 1;
  return ops.map((op) => {
    if (op.type === 'removed') return { kind: 'removed', text: op.text, n: beforeNo++ };
    if (op.type === 'added') return { kind: 'added', text: op.text, n: afterNo++ };
    return { kind: 'context', text: op.text, n: afterNo++ };
  });
}

export function computeLineDiff(beforeText, afterText) {
  const ops = lcsOps(splitLines(beforeText), splitLines(afterText));
  return { rows: rowsFromOps(ops), unified: unifiedFromOps(ops) };
}

// "4" -> [4]; "2-5" -> [2,3,4,5]. Malformed specs yield an empty list.
export function parseLineRange(spec) {
  const text = String(spec ?? '').trim();
  const single = text.match(/^(\d+)$/);
  if (single) return [Number(single[1])];
  const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!range) return [];
  const [start, end] = [Number(range[1]), Number(range[2])];
  if (end < start) return [];
  const out = [];
  for (let n = start; n <= end; n++) out.push(n);
  return out;
}

const PATCH_META_RE = /^(diff --git |index |--- |\+\+\+ |new file |deleted file |rename |similarity |old mode |new mode |Binary files )/;

export function classifyPatchLine(line) {
  if (PATCH_META_RE.test(line)) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('\\')) return 'meta';
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}
