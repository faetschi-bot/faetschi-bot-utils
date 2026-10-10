import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readCatalog } from '../lib/catalog.mjs';
import {
  executePlan,
  missingInstallers,
  planInstall,
  resolveCommandPath,
  resolveHarnesses,
} from '../lib/install.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const catalog = readCatalog(packageRoot);

test('planInstall builds each harness command from the catalog', () => {
  const { steps } = planInstall({ catalog, all: true, harnesses: ['pi', 'omp'] });
  assert.deepEqual(
    steps.map((step) => step.command),
    [
      ['pi', 'install', 'git:github.com/aliceisjustplaying/pi-you-should-know'],
      ['omp', 'plugin', 'install', 'github:ubranch/omp-you-should-know'],
    ],
  );
});

test('planInstall adds --local for pi only', () => {
  const { steps } = planInstall({ catalog, names: ['you-should-know'], harnesses: ['pi'], local: true });
  assert.deepEqual(steps[0].command, ['pi', 'install', 'git:github.com/aliceisjustplaying/pi-you-should-know', '--local']);
});

test('planInstall rejects --local against the omp installer', () => {
  assert.throws(
    () => planInstall({ catalog, names: ['you-should-know'], harnesses: ['omp'], local: true }),
    /--local is not supported by the omp installer/,
  );
});

test('planInstall skips a harness with no source', () => {
  const piOnly = {
    extensions: [
      {
        name: 'pi-only',
        summary: 'x',
        sources: { pi: { installer: 'pi', spec: 'git:example/pi-only', homepage: 'https://example.test', license: 'MIT' } },
      },
    ],
  };
  const { steps, skipped } = planInstall({ catalog: piOnly, all: true, harnesses: ['pi', 'omp'] });
  assert.equal(steps.length, 1);
  assert.deepEqual(skipped, [{ extension: 'pi-only', harness: 'omp', reason: 'not available for this harness' }]);
});

test('planInstall rejects unknown names and ambiguous selections', () => {
  assert.throws(() => planInstall({ catalog, names: ['nope'], harnesses: ['pi'] }), /unknown extension/);
  assert.throws(() => planInstall({ catalog, all: true, names: ['you-should-know'], harnesses: ['pi'] }), /cannot combine/);
  assert.throws(() => planInstall({ catalog, harnesses: ['pi'] }), /no extensions selected/);
});

test('resolveHarnesses handles explicit values and auto-detection', () => {
  assert.deepEqual(resolveHarnesses('pi').harnesses, ['pi']);
  assert.deepEqual(resolveHarnesses('both').harnesses, ['pi', 'omp']);
  assert.deepEqual(resolveHarnesses('auto', { isAvailable: (command) => command === 'omp' }).harnesses, ['omp']);
  assert.deepEqual(resolveHarnesses('auto', { isAvailable: () => false }).harnesses, []);
  assert.throws(() => resolveHarnesses('nope'), /Unknown --harness/);
});

test('resolveCommandPath finds an executable on a fake PATH', () => {
  const pathEnv = ['/one', '/two'].join(':');
  assert.equal(
    resolveCommandPath('pi', { pathEnv, platform: 'linux', isExecutable: (path) => path === '/two/pi' }),
    '/two/pi',
  );
  assert.equal(resolveCommandPath('pi', { pathEnv, platform: 'linux', isExecutable: () => false }), undefined);
  assert.equal(
    resolveCommandPath('/opt/pi', { isExecutable: (path) => path === '/opt/pi' }),
    '/opt/pi',
  );
});

test('missingInstallers reports commands absent from PATH', () => {
  const { steps } = planInstall({ catalog, all: true, harnesses: ['pi', 'omp'] });
  const missing = missingInstallers(steps, { resolve: (command) => (command === 'pi' ? '/usr/bin/pi' : undefined) });
  assert.deepEqual(missing, ['omp']);
});

test('executePlan runs steps in order and stops after the first failure', () => {
  const { steps } = planInstall({ catalog, all: true, harnesses: ['pi', 'omp'] });
  const seen = [];
  const results = executePlan(steps, {
    run: (command, args) => {
      seen.push([command, ...args]);
      return { status: 1, stderr: 'boom' };
    },
  });
  assert.deepEqual(seen, [['pi', 'install', 'git:github.com/aliceisjustplaying/pi-you-should-know']]);
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].stderr, 'boom');
});

test('executePlan reports success for every step', () => {
  const { steps } = planInstall({ catalog, all: true, harnesses: ['pi', 'omp'] });
  const results = executePlan(steps, { run: () => ({ status: 0 }) });
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.ok));
});
