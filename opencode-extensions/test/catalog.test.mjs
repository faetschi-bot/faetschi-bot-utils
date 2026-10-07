import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { listExtensions, readCatalog, validateCatalog } from '../lib/catalog.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function sampleCatalog(overrides = {}) {
  return {
    extensions: [
      {
        name: 'sample',
        summary: 'A sample extension.',
        installer: 'opencode',
        spec: '@example/sample@latest',
        homepage: 'https://github.com/example/sample',
        license: 'MIT',
      },
    ],
    ...overrides,
  };
}

test('packaged catalog is valid and lists the curated extensions', () => {
  const result = validateCatalog(readCatalog(packageRoot));
  assert.equal(result.ok, true, result.errors.join('; '));
  const codex = result.extensions.find((entry) => entry.name === 'codex-multi-auth');
  assert.ok(codex, 'catalog should include codex-multi-auth');
  assert.equal(codex.installer, 'npx');
  assert.deepEqual(codex.args, ['--modern']);
  const plannotator = result.extensions.find((entry) => entry.name === 'plannotator');
  assert.ok(plannotator, 'catalog should include plannotator');
  assert.equal(plannotator.installer, 'opencode');
});

test('validateCatalog accepts a well-formed catalog', () => {
  assert.equal(validateCatalog(sampleCatalog()).ok, true);
});

test('validateCatalog rejects an empty or missing extensions array', () => {
  assert.equal(validateCatalog({ extensions: [] }).ok, false);
  assert.equal(validateCatalog({}).ok, false);
});

test('validateCatalog rejects bad names, duplicates, and missing summaries', () => {
  const badName = sampleCatalog({ extensions: [{ ...sampleCatalog().extensions[0], name: 'Bad Name' }] });
  assert.match(validateCatalog(badName).errors.join('\n'), /lowercase kebab-case/);

  const duplicate = sampleCatalog();
  duplicate.extensions.push(structuredClone(duplicate.extensions[0]));
  assert.match(validateCatalog(duplicate).errors.join('\n'), /duplicate name/);

  const noSummary = sampleCatalog({ extensions: [{ ...sampleCatalog().extensions[0], summary: '' }] });
  assert.match(validateCatalog(noSummary).errors.join('\n'), /missing non-empty "summary"/);
});

test('validateCatalog rejects a malformed entry', () => {
  const base = sampleCatalog().extensions[0];
  const cases = [
    [{ installer: undefined }, /"installer" must be one of/],
    [{ installer: 'pip' }, /"installer" must be one of/],
    [{ spec: '' }, /"spec"/],
    [{ homepage: 'http://x' }, /https URL/],
    [{ license: '' }, /"license"/],
    [{ installer: 'npx', args: '--modern' }, /"args" must be an array of non-empty strings/],
    [{ installer: 'npx', args: [''] }, /"args" must be an array of non-empty strings/],
    [{ installer: 'opencode', args: ['--x'] }, /the "opencode" installer does not accept "args"/],
  ];
  for (const [override, pattern] of cases) {
    const result = validateCatalog(sampleCatalog({ extensions: [{ ...base, ...override }] }));
    assert.equal(result.ok, false, `expected invalid for ${JSON.stringify(override)}`);
    assert.match(result.errors.join('\n'), pattern);
  }
});

test('validateCatalog reports per-entry validity', () => {
  const catalog = sampleCatalog();
  catalog.extensions.push({ name: 'Bad Name', summary: '' });
  const result = validateCatalog(catalog);
  assert.equal(result.ok, false);
  assert.equal(result.entries[0].ok, true);
  assert.equal(result.entries[0].installer, 'opencode');
  assert.equal(result.entries[1].ok, false);
});

test('listExtensions returns display fields and survives an invalid entry', () => {
  const catalog = sampleCatalog();
  catalog.extensions.push(null);
  const listed = listExtensions(catalog);
  assert.equal(listed[0].name, 'sample');
  assert.equal(listed[0].spec, '@example/sample@latest');
  assert.equal(listed[1].name, '(invalid)');
});
