// Catalog loading and validation for opencode-extensions.
//
// The catalog is data (catalog.json): one entry per logical OpenCode plugin,
// naming the installer that owns installation and the spec handed to it. The
// installer owns installation, so this tool never copies plugin code; it only
// records where OpenCode (or the plugin's own installer) should fetch it from.
// Validation is pure so the CLI, `doctor`, and the tests share one definition
// of a valid catalog.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTALLER_NAMES } from './installers.mjs';

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
    return { name: null, installer: null, ok: false, errors: [`${where}: must be an object`] };
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
  const installer = typeof extension.installer === 'string' ? extension.installer : null;
  if (!installer || !INSTALLER_NAMES.includes(installer)) {
    errors.push(`${label}: "installer" must be one of ${INSTALLER_NAMES.join(', ')}`);
  }
  if (typeof extension.spec !== 'string' || extension.spec.trim() === '') {
    errors.push(`${label}: missing non-empty "spec"`);
  }
  if (typeof extension.homepage !== 'string' || !extension.homepage.startsWith('https://')) {
    errors.push(`${label}: "homepage" must be an https URL`);
  }
  if (typeof extension.license !== 'string' || extension.license.trim() === '') {
    errors.push(`${label}: missing "license"`);
  }
  return { name, installer, ok: errors.length === 0, errors };
}

// Returns entries shaped for display and JSON output. A malformed entry is
// reported by validateCatalog; keep display from throwing so doctor still
// prints its errors.
export function listExtensions(catalog) {
  return (catalog?.extensions ?? []).map((extension) => {
    if (!extension || typeof extension !== 'object') {
      return { name: '(invalid)', summary: '', installer: null, spec: null };
    }
    return {
      name: extension.name,
      summary: extension.summary,
      installer: extension.installer,
      spec: extension.spec,
      homepage: extension.homepage,
      license: extension.license,
    };
  });
}
