import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReleaseConfig } from '../lib/release-config.mjs';
import { detectTagPrefixes, isUnusablePrTitle } from '../lib/checks.mjs';

const scaffold = `changelog:
  exclude:
    labels:
      - ignore-for-release
    authors:
      - dependabot[bot]
  categories:
    - title: Breaking Changes
      labels:
        - breaking-change
        - semver-major
    - title: Features
      labels:
        - enhancement
    - title: Fixes
      labels:
        - bug
        - fix
    - title: Other Changes
      labels:
        - "*"
`;

test('accepts the scaffold, including exclude labels', () => {
  const r = analyzeReleaseConfig(scaffold);
  assert.equal(r.ok, true);
  assert.equal(r.categories.length, 4);
  assert.deepEqual(r.excludeLabels, ['ignore-for-release']);
});

test('accepts inline lists', () => {
  const r = analyzeReleaseConfig(
    'changelog:\n  categories:\n    - title: Features\n      labels: [enhancement, feature]\n    - title: Other\n      labels: ["*"]\n',
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.categories[0].labels, ['enhancement', 'feature']);
});

test('accepts CRLF line endings', () => {
  assert.equal(analyzeReleaseConfig(scaffold.replace(/\n/g, '\r\n')).ok, true);
});

test('reports a missing catch-all', () => {
  const r = analyzeReleaseConfig('changelog:\n  categories:\n    - title: Features\n      labels: [enhancement]\n');
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /catch-all/);
});

test('reports a catch-all that is not last', () => {
  const r = analyzeReleaseConfig(
    'changelog:\n  categories:\n    - title: Other\n      labels: ["*"]\n    - title: Fixes\n      labels: [bug]\n',
  );
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /unreachable/);
});

test('reports a label reused across categories', () => {
  const r = analyzeReleaseConfig(
    'changelog:\n  categories:\n    - title: A\n      labels: [bug, enhancement]\n    - title: B\n      labels: [bug]\n    - title: Other\n      labels: ["*"]\n',
  );
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /appears in categories/);
});

test('reports a category without labels and an empty category list', () => {
  assert.match(
    analyzeReleaseConfig('changelog:\n  categories:\n    - title: Features\n    - title: Other\n      labels: ["*"]\n').errors.join(' '),
    /has no labels/,
  );
  assert.equal(analyzeReleaseConfig('changelog:\n  categories: []\n').ok, false);
});

test('reports a missing changelog mapping and an empty file', () => {
  assert.equal(analyzeReleaseConfig('something: else\n').ok, false);
  assert.equal(analyzeReleaseConfig('').ok, false);
});

test('rejects tab indentation with a parse error', () => {
  const r = analyzeReleaseConfig('changelog:\n\tcategories: []\n');
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /tabs/);
});

test('keeps colons inside a title', () => {
  const r = analyzeReleaseConfig(
    'changelog:\n  categories:\n    - title: "Fix: the thing"\n      labels: [bug]\n    - title: Other\n      labels: ["*"]\n',
  );
  assert.equal(r.ok, true);
  assert.equal(r.categories[0].title, 'Fix: the thing');
});

test('flags unusable PR titles', () => {
  for (const title of ['wip', 'misc', 'Update', 'fix', 'Merge branch x', 'feat/new-thing', '  ', 'Ship it WIP']) {
    assert.equal(isUnusablePrTitle({ title }), true, title);
  }
  assert.equal(isUnusablePrTitle({ title: 'feat(ui): add dark mode' }), false);
  assert.equal(isUnusablePrTitle({ title: 'Fix crash when the token expires' }), false);
  assert.equal(isUnusablePrTitle({ title: 'refactor/cleanup', headRefName: 'refactor/cleanup' }), true);
});

test('detects one tag family and exposes ambiguity for monorepos', () => {
  assert.deepEqual(detectTagPrefixes(['v1.0.0', 'v1.1.0']), ['v']);
  assert.deepEqual(detectTagPrefixes(['widget-v1.0.0', 'widget-v1.1.0']), ['widget-v']);
  assert.deepEqual(detectTagPrefixes(['widget-v1.0.0', 'api-v2.0.0']), ['api-v', 'widget-v']);
});
