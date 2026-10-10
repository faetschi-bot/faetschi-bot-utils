// Catalog loading and validation for pi-collection.
//
// The catalog is data (catalog.json): one entry per logical extension, with one
// native install source per harness. The harness owns installation, so this
// tool never copies extension code; it only records where each harness should
// fetch the extension from. Validation is pure so the CLI, `doctor`, and the
// tests share one definition of a valid catalog.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HARNESSES } from './harnesses.mjs';

export const CATALOG_FILE = 'catalog.json';
export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function readCatalog(root) {
  const file = join(root, CATALOG_FILE);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`cannot read catalog: ${file} (${error.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${file}: ${error.message}`);
  }
}

export function validateCatalog(catalog) {
  const extensions = Array.isArray(catalog?.extensions) ? catalog.extensions : null;
  if (!extensions) {
    return { ok: false, errors: ['catalog must have an "extensions" array'], extensions: [], entries: [] };
  }
  const errors = [];
  if (extensions.length === 0) errors.push('catalog "extensions" must not be empty');

  const seen = new Set();
  const entries = extensions.map((extension, index) => validateExtension(extension, index, seen));
  for (const entry of entries) errors.push(...entry.errors);

  return { ok: errors.length === 0, errors, extensions, entries };
}

// Validates one entry and returns its own ok/errors so `doctor` can label each
// entry instead of marking everything [ok] when one entry is broken.
function validateExtension(extension, index, seen) {
  const where = `extensions[${index}]`;
  if (!extension || typeof extension !== 'object') {
    return { name: null, harnesses: [], ok: false, errors: [`${where}: must be an object`] };
  }
  const errors = [];
  const name = typeof extension.name === 'string' ? extension.name : null;
  const label = name ? `${where} (${name})` : where;
  if (typeof extension.name !== 'string' || !NAME_RE.test(extension.name)) {
    errors.push(`${label}: "name" must be lowercase kebab-case`);
  } else if (seen.has(extension.name)) {
    errors.push(`${label}: duplicate name`);
  } else {
    seen.add(extension.name);
  }
  if (typeof extension.summary !== 'string' || extension.summary.trim() === '') {
    errors.push(`${label}: missing non-empty "summary"`);
  }
  const sources = extension.sources;
  const harnesses = sources && typeof sources === 'object' && !Array.isArray(sources) ? Object.keys(sources) : [];
  errors.push(...validateSources(sources, label));
  return { name, harnesses, ok: errors.length === 0, errors };
}

function validateSources(sources, label) {
  const errors = [];
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
    return [`${label}: missing "sources" object`];
  }
  const harnesses = Object.keys(sources);
  if (harnesses.length === 0) errors.push(`${label}: "sources" must list at least one harness`);
  for (const harness of harnesses) {
    const where = `${label}.sources.${harness}`;
    if (!HARNESSES.includes(harness)) {
      errors.push(`${where}: unknown harness (expected ${HARNESSES.join(', ')})`);
      continue;
    }
    const source = sources[harness];
    if (!source || typeof source !== 'object') {
      errors.push(`${where}: must be an object`);
      continue;
    }
    if (source.installer !== harness) errors.push(`${where}: "installer" must be "${harness}"`);
    if (typeof source.spec !== 'string' || source.spec.trim() === '') {
      errors.push(`${where}: missing non-empty "spec"`);
    }
    if (typeof source.homepage !== 'string' || !source.homepage.startsWith('https://')) {
      errors.push(`${where}: "homepage" must be an https URL`);
    }
    if (typeof source.license !== 'string' || source.license.trim() === '') {
      errors.push(`${where}: missing "license"`);
    }
  }
  return errors;
}

// Returns entries shaped for display and JSON output, with sources narrowed to
// the requested harness when one is given. `both` (or omitted) keeps all.
export function listExtensions(catalog, { harness } = {}) {
  const wanted = !harness || harness === 'both' ? null : [harness];
  return (catalog?.extensions ?? [])
    .map((extension) => {
      // A malformed entry is reported by validateCatalog; keep display from
      // throwing so doctor still prints its errors.
      if (!extension || typeof extension !== 'object') {
        return { name: '(invalid)', summary: '', sources: {} };
      }
      const sources = extension.sources ?? {};
      const keys = Object.keys(sources).filter((key) => !wanted || wanted.includes(key));
      return {
        name: extension.name,
        summary: extension.summary,
        sources: Object.fromEntries(keys.map((key) => [key, sources[key]])),
      };
    })
    .filter((extension) => Object.keys(extension.sources).length > 0);
}
