#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cacheDir } from '../lib/config.mjs';
import { CliError } from '../lib/errors.mjs';
import { applyEnvFile, commandsDir, ensureProvisioned, loadPlaywright } from '../lib/shared.mjs';

const DEFAULT_COMMAND = 'capture';

async function loadCommands() {
  const commands = new Map();
  let files = [];
  try {
    files = readdirSync(commandsDir)
      .filter((f) => f.endsWith('.mjs'))
      .sort();
  } catch {
    /* no commands directory */
  }
  for (const f of files) {
    let mod;
    try {
      mod = await import(pathToFileURL(join(commandsDir, f)).href);
    } catch (e) {
      console.error(`[visual-shot] failed to load command ${f}: ${e.message}`);
      continue;
    }
    if (!mod.name || typeof mod.run !== 'function') continue;
    commands.set(mod.name, mod);
    for (const alias of mod.aliases ?? []) commands.set(alias, mod);
  }
  return commands;
}

function globalUsage(commands) {
  const seen = new Set();
  const rows = [];
  for (const [name, mod] of commands) {
    if (seen.has(mod)) continue;
    seen.add(mod);
    rows.push(`  ${name.padEnd(9)} ${mod.summary}`);
  }
  return `visual-shot - visual artifacts for PR review.

Usage:
  visual-shot <command> [options]
  visual-shot [options]            # same as "visual-shot capture"

Commands:
${rows.join('\n')}

Run "visual-shot <command> --help" for command options.

Env:
  VISUAL_SHOT_CACHE                 persistent cache dir for Chromium + libs
  VISUAL_SHOT_PLAYWRIGHT_VERSION    pinned Playwright version
  VISUAL_SHOT_MERMAID_VERSION       pinned Mermaid version (diagram)`;
}

async function main() {
  const argv = process.argv.slice(2);
  const commands = await loadCommands();

  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(globalUsage(commands));
    return 0;
  }

  const first = argv[0];
  const command = commands.get(first) ?? commands.get(DEFAULT_COMMAND);
  if (!command) throw new CliError('no commands available', 1);
  const rest = commands.get(first) ? argv.slice(1) : argv;

  const opts = command.parse(rest);
  if (opts.help) {
    console.log(command.usage());
    return 0;
  }

  const cache = cacheDir();
  process.env.VISUAL_SHOT_CACHE = cache;
  const ctx = { cache, chromium: null, devices: null, playwright: null };

  // Validate arguments before any provisioning so bad input fails fast.
  const plan = command.validate ? command.validate(opts) : opts;

  if (command.needsBrowser) {
    ensureProvisioned(cache);
    applyEnvFile(join(cache, 'env.sh'));
    const pw = loadPlaywright(cache);
    if (!pw || !pw.chromium) throw new CliError('playwright not found. Run: visual-shot setup', 1);
    ctx.playwright = pw;
    ctx.chromium = pw.chromium;
    ctx.devices = pw.devices;
  }

  const code = await command.run(plan, ctx);
  return typeof code === 'number' ? code : 0;
}

try {
  process.exitCode = await main();
} catch (e) {
  const code = e instanceof CliError ? e.code : 1;
  const json = process.argv.includes('--json');
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: e.message }, null, 2)}\n`);
  } else {
    process.stderr.write(`[visual-shot] ${e.message}\n`);
  }
  process.exitCode = code;
}
