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
        sources: {
          pi: {
            installer: 'pi',
            spec: 'git:github.com/example/sample',
            homepage: 'https://github.com/example/sample',
            license: 'MIT',
          },
        },
      },
    ],
    ...overrides,
  };
}

test('packaged catalog is valid and lists you-should-know for pi and omp', () => {
  const result = validateCatalog(readCatalog(packageRoot));
  assert.equal(result.ok, true, result.errors.join('; '));
  const extension = result.extensions.find((entry) => entry.name === 'you-should-know');
  assert.ok(extension, 'catalog should include you-should-know');
  assert.deepEqual(Object.keys(extension.sources).sort(), ['omp', 'pi']);
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

test('validateCatalog rejects a malformed source', () => {
  const cases = [
    [{ sources: undefined }, /missing "sources" object/],
    [{ sources: {} }, /must list at least one harness/],
    [{ sources: { vim: {} } }, /unknown harness/],
    [
      { sources: { pi: { installer: 'omp', spec: 'x', homepage: 'https://x', license: 'MIT' } } },
      /"installer" must be "pi"/,
    ],
    [{ sources: { pi: { installer: 'pi', spec: '', homepage: 'https://x', license: 'MIT' } } }, /"spec"/],
    [{ sources: { pi: { installer: 'pi', spec: 'x', homepage: 'http://x', license: 'MIT' } } }, /https URL/],
    [{ sources: { pi: { installer: 'pi', spec: 'x', homepage: 'https://x' } } }, /"license"/],
  ];
  for (const [extension, pattern] of cases) {
    const result = validateCatalog(sampleCatalog({ extensions: [{ name: 'sample', summary: 'x', ...extension }] }));
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), pattern);
  }
});

test('validateCatalog reports per-entry validity', () => {
  const catalog = sampleCatalog();
  catalog.extensions.push({ name: 'Bad Name', summary: '' });
  const result = validateCatalog(catalog);
  assert.equal(result.ok, false);
  assert.equal(result.entries[0].ok, true);
  assert.deepEqual(result.entries[0].harnesses, ['pi']);
  assert.equal(result.entries[1].ok, false);
});

test('listExtensions narrows sources to the requested harness', () => {
  const catalog = sampleCatalog();
  catalog.extensions[0].sources.omp = {
    installer: 'omp',
    spec: 'github:example/sample',
    homepage: 'https://github.com/example/sample',
    license: 'MIT',
  };
  assert.deepEqual(Object.keys(listExtensions(catalog, { harness: 'pi' })[0].sources), ['pi']);
  assert.deepEqual(Object.keys(listExtensions(catalog, { harness: 'omp' })[0].sources), ['omp']);
  assert.deepEqual(Object.keys(listExtensions(catalog, { harness: 'both' })[0].sources).sort(), ['omp', 'pi']);
});
