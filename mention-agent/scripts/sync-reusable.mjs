#!/usr/bin/env node
// Writes the shared reusable workflow from lib/render.mjs so the committed file
// can never drift from the renderer. `--check` fails instead of writing, for CI.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderReusable } from '../lib/render.mjs';

const dest = fileURLToPath(new URL('../../.github/workflows/mention-agent.yml', import.meta.url));
const content = renderReusable();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(dest, 'utf8');
  } catch {
    current = '';
  }
  if (current !== content) {
    console.error('[mention-agent] .github/workflows/mention-agent.yml is out of date; run `npm run sync-reusable`.');
    process.exitCode = 1;
  }
} else {
  writeFileSync(dest, content);
  console.log(`[mention-agent] wrote ${dest}`);
}
