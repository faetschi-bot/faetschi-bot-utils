#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listExtensions, readCatalog, validateCatalog } from '../lib/catalog.mjs';
import { CliError } from '../lib/errors.mjs';
import { HARNESSES } from '../lib/harnesses.mjs';
import {
  executePlan,
  harnessStatus,
  missingInstallers,
  planInstall,
  resolveCommandPath,
  resolveHarnesses,
  runCaptured,
  runInherit,
} from '../lib/install.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;

function usage() {
  console.log(`pi-extensions - install a curated set of Pi and OMP extensions.

Usage:
  pi-extensions list [--harness pi|omp|both] [--json]
  pi-extensions doctor [--json]
  pi-extensions install <name...> [options]
  pi-extensions install --all [options]

Options:
  --root <path>        catalog root to use (default: this package)
  --harness <name>     list: pi, omp, or both
                       install: pi, omp, both, or auto (default: auto = on PATH)
  --local              install for the current project instead of the user (pi only)
  --global             install for the user (default)
  --all                select every extension in the catalog
  --dry-run            print the native install commands without running them
  --json               print a machine-readable result object
  --version            print the version
  --help               show this help

This tool does not copy extension code. It runs each harness's own installer:

  pi   pi install <spec>
  omp  omp plugin install <spec>

The catalog (catalog.json) maps each extension to a source per harness, so a
license that forbids redistribution is respected: the upstream repo is the only
copy. Install stops at the first failed step and reports the rest as not
attempted.`);
}

function parse(argv) {
  const options = { names: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (options.command === undefined && (arg === 'list' || arg === 'doctor' || arg === 'install')) {
      options.command = arg;
      continue;
    }
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new CliError(`Missing value for ${arg}`);
      return next;
    };
    if (arg === '--root') options.root = value();
    else if (arg === '--harness') options.harness = value();
    else if (arg === '--json') options.json = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--local') options.local = true;
    else if (arg === '--global') options.global = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--')) throw new CliError(`Unknown option: ${arg}`);
    else options.names.push(arg);
  }
  if (options.local && options.global) throw new CliError('Cannot combine --local with --global');
  return options;
}

// Reads and validates the catalog once so list/install fail the same way on a
// broken catalog instead of running the native installer halfway through.
function loadValidCatalog(root) {
  const catalog = readCatalog(root);
  const validation = validateCatalog(catalog);
  if (!validation.ok) {
    throw new CliError(`invalid catalog:\n  ${validation.errors.join('\n  ')}`, 1);
  }
  return catalog;
}

function runList(options, root) {
  const harness = options.harness ?? 'both';
  const allowed = [...HARNESSES, 'both'];
  if (!allowed.includes(harness)) {
    throw new CliError(`Unknown --harness: ${harness} (expected ${allowed.join(', ')})`);
  }
  const extensions = listExtensions(loadValidCatalog(root), { harness });
  if (options.json) {
    console.log(JSON.stringify({ ok: true, root, harness, extensions }, null, 2));
    return;
  }
  if (extensions.length === 0) {
    console.log(`[pi-extensions] no extensions for harness ${harness}`);
    return;
  }
  for (const extension of extensions) {
    console.log(`${extension.name}\t${extension.summary}`);
    for (const [name, source] of Object.entries(extension.sources)) {
      console.log(`  ${name}\t${source.spec} (${source.license})`);
    }
  }
}

function runDoctor(options, root) {
  const validation = validateCatalog(readCatalog(root));
  const status = harnessStatus();
  const result = {
    ok: validation.ok,
    root,
    errors: validation.errors,
    extensions: validation.entries,
    harnesses: status,
  };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  for (const harness of HARNESSES) {
    const info = status[harness];
    const label = info.found ? `found: ${info.path}` : `not found (command "${info.command}")`;
    console.log(`${info.found ? '[ok]  ' : '[skip]'} ${harness} CLI ${label}`);
  }
  for (const entry of result.extensions) {
    const suffix = entry.harnesses?.length ? ` (${entry.harnesses.join(', ')})` : '';
    console.log(`${entry.ok ? '[ok]  ' : '[FAIL]'} ${entry.name ?? '(invalid)'}${suffix}`);
  }
  for (const error of validation.errors) console.log(`        error: ${error}`);
  console.log(result.ok ? '[pi-extensions] catalog valid' : '[pi-extensions] catalog validation failed');
  process.exitCode = result.ok ? 0 : 1;
}

function runInstall(options, root) {
  const catalog = loadValidCatalog(root);
  const requested = options.harness ?? 'auto';
  let { harnesses } = resolveHarnesses(requested, {
    isAvailable: (command) => Boolean(resolveCommandPath(command)),
  });
  if (harnesses.length === 0 && options.dryRun && requested === 'auto') {
    // A preview should work on a machine without the harnesses; with nothing to
    // detect, show the full catalog plan instead of failing the detection.
    harnesses = [...HARNESSES];
  }
  if (harnesses.length === 0) {
    throw new CliError(
      `no supported harness found on PATH (looked for: ${HARNESSES.join(', ')}); install one, or pass --harness ${HARNESSES.join('|')}`,
      1,
    );
  }

  const local = Boolean(options.local);
  const { steps, skipped } = planInstall({ catalog, names: options.names, all: options.all, harnesses, local });

  // A dry run only reports the plan, so it does not require the harness CLI to
  // be installed; a real install verifies availability before running anything.
  if (options.dryRun) {
    if (options.json) {
      console.log(
        JSON.stringify(
          { ok: true, root, dryRun: true, local, harnesses, skipped, steps: steps.map(summarizeStep) },
          null,
          2,
        ),
      );
      return;
    }
    for (const step of steps) console.log(`[pi-extensions] would run: ${step.command.join(' ')}`);
    for (const skip of skipped) console.log(`[pi-extensions] skip ${skip.extension} for ${skip.harness}: ${skip.reason}`);
    console.log('[pi-extensions] dry run: nothing installed');
    return;
  }

  const missing = missingInstallers(steps, { resolve: resolveCommandPath });
  if (missing.length > 0) {
    throw new CliError(`${missing.join(', ')} CLI not found on PATH; install it, or pass --harness for one you have`, 1);
  }

  const results = executePlan(steps, { run: options.json ? runCaptured : runInherit });
  const ok = results.every((result) => result.ok);
  // executePlan stops at the first failure; surface the steps it never reached
  // so a caller can see the run was incomplete.
  const notAttempted = steps.slice(results.length).map(summarizeStep);
  if (options.json) {
    console.log(
      JSON.stringify(
        { ok, root, local, harnesses, skipped, results: results.map(summarizeResult), notAttempted },
        null,
        2,
      ),
    );
    process.exitCode = ok ? 0 : 1;
    return;
  }
  for (const result of results) {
    console.log(`[pi-extensions] ${result.ok ? 'installed' : 'failed'} ${result.extension} for ${result.harness}`);
    if (!result.ok && result.error) console.log(`[pi-extensions]   ${result.error}`);
  }
  for (const skip of skipped) console.log(`[pi-extensions] skip ${skip.extension} for ${skip.harness}: ${skip.reason}`);
  for (const step of notAttempted) {
    console.log(`[pi-extensions] not attempted: ${step.extension} for ${step.harness}`);
  }
  process.exitCode = ok ? 0 : 1;
}

function summarizeStep(step) {
  return { extension: step.extension, harness: step.harness, command: step.command };
}

function summarizeResult(result) {
  const summary = {
    extension: result.extension,
    harness: result.harness,
    command: result.command,
    status: result.status,
    ok: result.ok,
  };
  if (result.stdout) summary.stdout = result.stdout;
  if (result.stderr) summary.stderr = result.stderr;
  if (result.error) summary.error = result.error;
  return summary;
}

function main(options) {
  const root = resolve(options.root || packageRoot);
  if (options.command === 'list') runList(options, root);
  else if (options.command === 'doctor') runDoctor(options, root);
  else if (options.command === 'install') runInstall(options, root);
  else usage();
}

let options;
try {
  options = parse(process.argv.slice(2));
  if (options.version) console.log(version);
  else if (options.help) usage();
  else main(options);
} catch (error) {
  const code = error instanceof CliError ? error.code : 1;
  const json = options?.json ?? process.argv.includes('--json');
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }, null, 2) + '\n');
  } else {
    process.stderr.write(`[pi-extensions] ${error.message}\n`);
  }
  process.exitCode = code;
}
