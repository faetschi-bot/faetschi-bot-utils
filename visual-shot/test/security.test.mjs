import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playwrightVersion } from '../lib/config.mjs';
import { CHROMIUM_ARGS, launchBrowser } from '../lib/shared.mjs';

test('Playwright pin defaults to the current release', () => {
  assert.equal(playwrightVersion({}), '1.64.1');
});

test('Chromium sandbox is on by default and can be disabled explicitly', async () => {
  assert.equal(CHROMIUM_ARGS.includes('--no-sandbox'), false);

  const launches = [];
  const fakeChromium = {
    launch: async (options) => {
      launches.push(options);
      return {};
    },
  };

  const previous = process.env.VISUAL_SHOT_NO_SANDBOX;
  try {
    delete process.env.VISUAL_SHOT_NO_SANDBOX;
    await launchBrowser(fakeChromium);
    assert.equal(launches[0].chromiumSandbox, true);

    process.env.VISUAL_SHOT_NO_SANDBOX = '1';
    await launchBrowser(fakeChromium);
    assert.equal(launches[1].chromiumSandbox, false);
  } finally {
    if (previous === undefined) delete process.env.VISUAL_SHOT_NO_SANDBOX;
    else process.env.VISUAL_SHOT_NO_SANDBOX = previous;
  }
});
