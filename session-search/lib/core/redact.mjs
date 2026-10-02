// Secrets are common in session transcripts, and the index is written to disk,
// so redaction happens at index time (see lib/index-run.mjs), not only when a
// result is printed. Bump the version when rules change so a reindex reapplies.
export const REDACTION_RULES_VERSION = 1;

const PLACEHOLDER = '[redacted]';

const RULES = [
  { name: 'openai-key', re: /sk-[A-Za-z0-9_-]{16,}/g },
  { name: 'github-pat', re: /ghp_[A-Za-z0-9]{20,}/g },
  { name: 'github-fine-grained', re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'aws-key', re: /AKIA[0-9A-Z]{16}/g },
  {
    name: 'private-key',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { name: 'auth-header', re: /(Authorization:\s*(?:Bearer|Basic|Token)\s+)\S+/gi, replace: `$1${PLACEHOLDER}` },
  {
    name: 'named-secret',
    re: /((?:api[_-]?key|access[_-]?token|secret|password)["'\s:=]+)[A-Za-z0-9_\-.]{12,}/gi,
    replace: `$1${PLACEHOLDER}`,
  },
  {
    name: 'url-token',
    re: /([?&](?:token|key|secret|sig|signature|access_token|api_key)=)[^&#\s]+/gi,
    replace: `$1${PLACEHOLDER}`,
  },
];

export function redactText(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  let out = text;
  for (const rule of RULES) out = out.replace(rule.re, rule.replace ?? PLACEHOLDER);
  return out;
}

// Recursively redact string leaves; returns a new value, never mutates input.
export function redactValue(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = redactValue(child);
    return out;
  }
  return value;
}
