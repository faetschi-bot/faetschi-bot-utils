// Shared helpers for turning harness payloads into index text. Keep this
// dependency-free: both source adapters import it.
export function stableStringify(value) {
  const seen = new WeakSet();
  const normalize = (node) => {
    if (node === null || typeof node !== 'object') return node;
    if (seen.has(node)) return '[circular]';
    seen.add(node);
    if (Array.isArray(node)) return node.map(normalize);
    const out = {};
    for (const key of Object.keys(node).sort()) out[key] = normalize(node[key]);
    return out;
  };
  return JSON.stringify(normalize(value));
}

export function truncateText(text, max) {
  if (typeof text !== 'string') return '';
  return text.length > max ? text.slice(0, max) : text;
}

export function toMs(timestamp) {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function contentText(content) {
  if (typeof content === 'string') return content;
  return asArray(content)
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}
