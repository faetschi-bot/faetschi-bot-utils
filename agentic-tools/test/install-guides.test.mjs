import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorLinks, headingAnchors, relativeLinks } from '../lib/skills.mjs';

const installDir = fileURLToPath(new URL('../install', import.meta.url));
const guides = readdirSync(installDir)
  .filter((name) => name.endsWith('.md'))
  .sort();

test('install guides are present', () => {
  assert.ok(guides.length > 0, 'expected at least one install guide');
  assert.ok(guides.includes('remotion.md'), 'expected install/remotion.md');
});

for (const guide of guides) {
  test(`install/${guide} is non-empty and its links resolve`, () => {
    const file = join(installDir, guide);
    const text = readFileSync(file, 'utf8');
    // A guide that lost its body or its title is not a usable setup guide.
    assert.ok(text.trim().length > 0, 'guide is empty');
    assert.match(text, /^# \S/m, 'guide has no top-level heading');

    for (const href of relativeLinks(text)) {
      const target = href.split('#')[0];
      if (!target) continue;
      assert.ok(existsSync(resolve(dirname(file), target)), `broken relative link in ${guide}: ${href}`);
    }

    // Guides link to their own sections; catch renamed headings.
    const anchors = headingAnchors(text);
    for (const anchor of anchorLinks(text)) {
      assert.ok(anchors.has(anchor), `broken anchor in ${guide}: #${anchor}`);
    }
  });
}
