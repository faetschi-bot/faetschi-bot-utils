import { CliError } from '../errors.mjs';
import { runProvision } from '../shared.mjs';

export const name = 'setup';
export const summary = 'Provision Chromium + libraries, then exit';
export const needsBrowser = false;

export function usage() {
  return `visual-shot setup

Provision the pinned Playwright + Chromium and any missing shared libraries into
the machine-global cache ($VISUAL_SHOT_CACHE). Idempotent; no root needed on
Debian/Ubuntu.`;
}

export function parse(argv) {
  const o = {};
  for (const a of argv) {
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json') o.json = true;
    else throw new CliError(`Unknown option: ${a}`);
  }
  return o;
}

export async function run(opts, ctx) {
  runProvision(ctx.cache);
  if (opts.json) console.log(JSON.stringify({ ok: true, cache: ctx.cache }, null, 2));
  else console.log('[visual-shot] setup complete');
  return 0;
}
