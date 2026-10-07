import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readCatalog } from '../lib/catalog.mjs';
import { executePlan, missingInstallers, planInstall, resolveCommandPath } from '../lib/install.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const catalog = readCatalog(packageRoot);

test('planInstall builds each entry command from its installer', () => {
  const { steps } = planInstall({ catalog, all: true });
  assert.deepEqual(
    steps.map((step) => step.command),
    [
      ['npx', '-y', 'oc-codex-multi-auth@latest', '--modern'],
      ['opencode', 'plugin', 'add', '@plannotator/opencode@latest'],
    ],
  );
});

test('planInstall selects a single extension by name', () => {
  const { steps } = planInstall({ catalog, names: ['plannotator'] });
  assert.deepEqual(steps.map((step) => step.extension), ['plannotator']);
});

test('planInstall rejects unknown names and ambiguous selections', () => {
  assert.throws(() => planInstall({ catalog, names: ['nope'] }), /unknown extension/);
  assert.throws(() => planInstall({ catalog, all: true, names: ['plannotator'] }), /cannot combine/);
  assert.throws(() => planInstall({ catalog }), /no extensions selected/);
});

test('planInstall rejects an unknown installer', () => {
  const broken = { extensions: [{ ...catalog.extensions[0], installer: 'pip' }] };
  assert.throws(() => planInstall({ catalog: broken, all: true }), /unknown installer/);
});

test('resolveCommandPath finds an executable on a fake PATH', () => {
  const pathEnv = ['/one', '/two'].join(':');
  assert.equal(
    resolveCommandPath('opencode', { pathEnv, platform: 'linux', isExecutable: (path) => path === '/two/opencode' }),
    '/two/opencode',
  );
  assert.equal(resolveCommandPath('opencode', { pathEnv, platform: 'linux', isExecutable: () => false }), undefined);
  assert.equal(
    resolveCommandPath('/opt/opencode', { isExecutable: (path) => path === '/opt/opencode' }),
    '/opt/opencode',
  );
});

test('missingInstallers reports commands absent from PATH', () => {
  const { steps } = planInstall({ catalog, all: true });
  const missing = missingInstallers(steps, {
    resolve: (command) => (command === 'opencode' ? '/usr/bin/opencode' : undefined),
  });
  assert.deepEqual(missing, ['npx']);
});

test('executePlan runs steps in order and stops after the first failure', () => {
  const { steps } = planInstall({ catalog, all: true });
  const seen = [];
  const results = executePlan(steps, {
    run: (command, args) => {
      seen.push([command, ...args]);
      return { status: 1, stderr: 'boom' };
    },
  });
  assert.deepEqual(seen, [['npx', '-y', 'oc-codex-multi-auth@latest', '--modern']]);
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].stderr, 'boom');
});

test('executePlan reports success for every step', () => {
  const { steps } = planInstall({ catalog, all: true });
  const results = executePlan(steps, { run: () => ({ status: 0 }) });
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.ok));
});
