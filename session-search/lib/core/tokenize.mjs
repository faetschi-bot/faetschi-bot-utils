// Tokenizer for mixed code and prose. For every word it emits the whole
// lowercased token and its case/digit subtokens, plus path-suffix tokens, so a
// query for "getUserById" and "user id" both match. No stemming: identifiers
// are exact symbols (the same reasoning GitHub code search uses).
const WORD_RE = /[A-Za-z0-9]+/g;
const PATH_RE = /[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+/g;

const DIALOGUE_FIELDS = new Set(['title', 'user', 'assistant', 'reasoning', 'compaction', 'other']);

// Unambiguous English fillers only, and only for dialogue fields; never strip
// tokens that could be identifiers. IDF already handles rare boilerplate.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
  'been', 'being', 'you', 'your', 'our', 'their', 'they', 'them', 'please',
  'about', 'into', 'over', 'have', 'has', 'had',
]);

export function tokenize(text, field) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const normalized = text.normalize('NFKC');
  const terms = [];
  const seen = new Set();

  const push = (token) => {
    const value = token.toLowerCase();
    if (!value) return;
    if (DIALOGUE_FIELDS.has(field) && STOPWORDS.has(value)) return;
    terms.push(value);
    seen.add(value);
  };

  for (const match of normalized.matchAll(WORD_RE)) {
    push(match[0]);
    const parts = splitSegment(match[0]);
    if (parts.length > 1) for (const part of parts) push(part);
  }

  for (const match of normalized.matchAll(PATH_RE)) {
    const segments = match[0].split(/[\\/]/).filter(Boolean);
    if (segments.length < 2) continue;
    const suffix = [];
    for (let i = segments.length - 1; i >= 0 && suffix.length < 2; i -= 1) {
      suffix.unshift(segments[i].toLowerCase());
      const joined = suffix.join('/');
      if (!seen.has(joined)) push(joined);
    }
  }

  return terms;
}

function splitSegment(segment) {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}
