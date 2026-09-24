import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mermaidVersion } from '../config.mjs';
import { CliError } from '../errors.mjs';
import { findFile, loadPlaywright } from '../shared.mjs';

export const name = 'doctor';
export const aliases = ['check'];
export const summary = 'Check the environment, then exit';
export const needsBrowser = false;

export function usage() {
  return `visual-shot doctor [--json] [--url <url>]

Check Node, the cache, Chromium, Playwright, and (with --url) whether a dev
server responds. Exits non-zero when a required check fails. Does not provision.`;
}

export function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--url') o.url = val();
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new CliError(`Unknown option: ${a}`);
  }
  return o;
}

export async function run(opts, ctx) {
  const { cache } = ctx;
  const checks = [];
  const add = (name, ok, detail, hint, required = true) =>
    checks.push({ name, ok, detail, hint, required });

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add('node', nodeMajor >= 20, `node ${process.version}`, 'Install Node 20 or newer.');

  add('cache', existsSync(cache), cache, 'Run: visual-shot setup');
  const provisioned = existsSync(join(cache, '.provisioned'));
  add('provisioned', provisioned, provisioned ? 'yes' : 'no', 'Run: visual-shot setup');

  const shell = findFile(join(cache, 'browsers'), 'headless_shell');
  add('chromium', Boolean(shell), shell || 'not found', 'Run: visual-shot setup');

  const pw = loadPlaywright(cache);
  add('playwright', Boolean(pw), pw ? 'resolvable' : 'not found', 'Run: visual-shot setup');

  const mermaidPath = join(cache, 'mermaid', `mermaid-${mermaidVersion()}.min.js`);
  add(
    'mermaid',
    existsSync(mermaidPath),
    existsSync(mermaidPath) ? mermaidPath : 'not fetched (optional; fetched on first diagram render)',
    'Run: visual-shot diagram <file> to fetch it.',
    false,
  );

  const url = opts.url || process.env.VISUAL_URL;
  if (url) {
    let reachable = false;
    let detail = 'not reachable';
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      reachable = res.status < 500;
      detail = `HTTP ${res.status}`;
    } catch (e) {
      detail = e.message;
    }
    add('server', reachable, `${url} (${detail})`, 'Start your dev server, or pass --url.');
  }

  const ok = checks.filter((c) => c.required).every((c) => c.ok);
  if (opts.json) {
    console.log(JSON.stringify({ ok, cache, checks }, null, 2));
  } else {
    for (const c of checks) {
      const label = c.ok ? '[ok]  ' : c.required ? '[FAIL]' : '[--]  ';
      console.log(`${label} ${c.name}: ${c.detail}`);
      if (!c.ok && c.required && c.hint) console.log(`        hint: ${c.hint}`);
    }
    console.log(ok ? '[visual-shot] environment ready' : '[visual-shot] environment not ready');
  }
  return ok ? 0 : 1;
}
