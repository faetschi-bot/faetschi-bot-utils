// Tool inputs are indexed intentionally (the "actions" tier), but an edit/write
// argument can carry a whole file. Cap stored strings so the cache stays small
// and does not retain large file bodies.
export const MAX_INPUT_STRING = 2000;
const MARKER = '…[truncated]';

export function capValue(value, max = MAX_INPUT_STRING) {
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}${MARKER}` : value;
  if (Array.isArray(value)) return value.map((child) => capValue(child, max));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = capValue(child, max);
    return out;
  }
  return value;
}
