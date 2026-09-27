// Minimal, dependency-free parser + validator for the .github/release.yml
// subset that GitHub's auto-generated release notes use:
//
//   changelog:
//     exclude:
//       labels: [ignore-for-release]
//       authors: [dependabot[bot]]
//     categories:
//       - title: Breaking Changes
//         labels: [breaking-change, semver-major]
//       - title: Other Changes
//         labels: ["*"]
//
// It supports block sequences (`- item`), inline sequences (`[a, b]`), quoted
// scalars, comments, and CRLF. A full YAML parser is intentionally avoided so
// the tool stays dependency-free; anything outside this subset is reported as a
// parse error rather than silently ignored.

export class ParseError extends Error {}

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function tokenize(text) {
  const lines = [];
  const raw = String(text).split(/\r?\n/);
  for (let n = 0; n < raw.length; n++) {
    const line = stripComment(raw[n]);
    if (!line.trim()) continue;
    const lead = line.match(/^[ \t]*/)[0];
    if (lead.includes('\t')) throw new ParseError(`tabs are not allowed for indentation (line ${n + 1})`);
    lines.push({ indent: lead.length, text: line.trim(), n: n + 1 });
  }
  return lines;
}

function splitTopLevel(s, sep = ',') {
  const parts = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (const ch of s) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === sep && depth === 0) {
        parts.push(cur);
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function splitKeyValue(s) {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ':' && depth === 0) {
        const key = s.slice(0, i).trim();
        const rest = s.slice(i + 1);
        if (key && (rest === '' || /^\s/.test(rest))) return { key, value: rest.trim() };
      }
    }
  }
  return null;
}

function parseScalar(v) {
  const s = v.trim();
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return s;
}

function isInlineList(v) {
  return v.startsWith('[') && v.endsWith(']');
}

function parseInlineList(v) {
  const inner = v.slice(1, -1).trim();
  if (!inner) return [];
  return splitTopLevel(inner).map((p) => parseScalar(p)).filter((p) => p !== '');
}

const isSeqItem = (t) => /^-(?:\s|$)/.test(t);

function parseBlock(lines, i, indent) {
  return isSeqItem(lines[i].text) ? parseSequence(lines, i, indent) : parseMapping(lines, i, indent);
}

function parseValue(lines, i, parentIndent, inlineValue) {
  if (inlineValue === '') {
    if (i < lines.length && lines[i].indent > parentIndent) return parseBlock(lines, i, lines[i].indent);
    return { value: null, i };
  }
  if (isInlineList(inlineValue)) return { value: parseInlineList(inlineValue), i };
  return { value: parseScalar(inlineValue), i };
}

function parseMapping(lines, i, indent) {
  const obj = {};
  while (i < lines.length && lines[i].indent === indent && !isSeqItem(lines[i].text)) {
    const kv = splitKeyValue(lines[i].text);
    if (!kv) throw new ParseError(`expected "key: value" (line ${lines[i].n})`);
    i++;
    const r = parseValue(lines, i, indent, kv.value);
    obj[kv.key] = r.value;
    i = r.i;
  }
  return { value: obj, i };
}

function parseSequence(lines, i, indent) {
  const arr = [];
  while (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i].text)) {
    const rest = lines[i].text.slice(1).trim();
    i++;
    if (rest === '') {
      if (i < lines.length && lines[i].indent > indent) {
        const r = parseBlock(lines, i, lines[i].indent);
        arr.push(r.value);
        i = r.i;
      } else {
        arr.push(null);
      }
      continue;
    }
    const kv = splitKeyValue(rest);
    if (!kv) {
      arr.push(parseScalar(rest));
      continue;
    }
    const map = {};
    const first = parseValue(lines, i, indent, kv.value);
    map[kv.key] = first.value;
    i = first.i;
    if (i < lines.length && lines[i].indent > indent && !isSeqItem(lines[i].text)) {
      const r = parseMapping(lines, i, lines[i].indent);
      Object.assign(map, r.value);
      i = r.i;
    }
    arr.push(map);
  }
  return { value: arr, i };
}

export function parseReleaseConfig(text) {
  const lines = tokenize(text);
  if (lines.length === 0) throw new ParseError('file is empty');
  const r = parseBlock(lines, 0, lines[0].indent);
  if (r.i !== lines.length) throw new ParseError(`unexpected content at line ${lines[r.i].n}`);
  return r.value;
}

function toLabelList(value, where, errors) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`"${where}" must be a list`);
    return [];
  }
  const out = [];
  value.forEach((v, idx) => {
    if (typeof v !== 'string' || !v.trim()) errors.push(`"${where}" entry ${idx + 1} is not a non-empty string`);
    else out.push(v.trim());
  });
  return out;
}

export function analyzeReleaseConfig(text) {
  const empty = { categories: [], labels: [], excludeLabels: [] };
  let doc;
  try {
    doc = parseReleaseConfig(text);
  } catch (e) {
    return { ok: false, errors: [e.message], ...empty };
  }

  const changelog = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc.changelog : undefined;
  if (!changelog || typeof changelog !== 'object' || Array.isArray(changelog)) {
    return { ok: false, errors: ['missing a top-level "changelog:" mapping'], ...empty };
  }

  const errors = [];
  let excludeLabels = [];
  if (changelog.exclude != null) {
    if (typeof changelog.exclude !== 'object' || Array.isArray(changelog.exclude)) {
      errors.push('"changelog.exclude" must be a mapping');
    } else {
      excludeLabels = toLabelList(changelog.exclude.labels, 'changelog.exclude.labels', errors);
      if (changelog.exclude.authors != null) toLabelList(changelog.exclude.authors, 'changelog.exclude.authors', errors);
    }
  }

  if (!Array.isArray(changelog.categories) || changelog.categories.length === 0) {
    errors.push('"changelog.categories" must be a non-empty list');
    return { ok: false, errors, categories: [], labels: [], excludeLabels };
  }

  const categories = [];
  changelog.categories.forEach((cat, idx) => {
    const where = `category ${idx + 1}`;
    if (!cat || typeof cat !== 'object' || Array.isArray(cat)) {
      errors.push(`${where} must be a mapping with "title" and "labels"`);
      return;
    }
    const title = typeof cat.title === 'string' ? cat.title.trim() : '';
    if (!title) errors.push(`${where} has no "title"`);
    const labels = toLabelList(cat.labels, `${where} labels`, errors);
    if (labels.length === 0) errors.push(`${where} ("${title || '?'}") has no labels`);
    categories.push({ title, labels });
  });

  const seen = new Map();
  categories.forEach((cat, idx) => {
    cat.labels.forEach((l) => {
      if (seen.has(l)) errors.push(`label "${l}" appears in categories ${seen.get(l) + 1} and ${idx + 1}; only the first match is used`);
      else seen.set(l, idx);
    });
  });

  const starIdx = categories.findIndex((c) => c.labels.includes('*'));
  if (starIdx === -1) errors.push('no catch-all category ("*"); PRs matching no category are dropped from the release notes');
  else if (starIdx !== categories.length - 1) errors.push(`catch-all "*" is in category ${starIdx + 1}, making later categories unreachable`);

  const labels = categories.flatMap((c) => c.labels);
  return { ok: errors.length === 0, errors, categories, labels, excludeLabels };
}
