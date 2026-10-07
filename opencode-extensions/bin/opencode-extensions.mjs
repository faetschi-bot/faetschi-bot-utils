#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listExtensions, readCatalog, validateCatalog } from '../lib/catalog.mjs';
import { CliError } from '../lib/errors.mjs';
import { INSTALLER_NAMES } from '../lib/installers.mjs';
import {
  executePlan,
  installerStatus,
  missingInstallers,
  planInstall,
  resolveCommandPath,
  runCaptured,
  runInherit,
} from '../lib/install.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
const TOOL = 'opencode-extensions';

function usage() {
  console.log(`opencode-extensions - install a curated set of OpenCode plugins.

Usage:
  opencode-extensions list [--json]
  opencode-extensions doctor [--json]
  opencode-extensions install <name...> [options]
  opencode-extensions install --all [options]

Options:
  --root <path>        catalog root to use (default: this package)
  --all                select every extension in the catalog
  --dry-run            print the installer commands without running them
  --json               print a machine-readable result object
  --version            print the version
  --help               show this help

This tool does not copy plugin code. It runs OpenCode's own plugin manager:

  opencode plugin add <spec>

The catalog (catalog.json) maps each plugin to the spec passed verbatim to
\`opencode plugin add\`, so licenses and updates stay with the upstream project.
Installs are global: OpenCode writes the user's configuration. Install stops at
the first failed step and reports the rest as not attempted.`);
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
    else if (arg === '--json') options.json = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--')) throw new CliError(`Unknown option: ${arg}`);
    else options.names.push(arg);
  }
  return options;
}

// Reads and validates the catalog once so list/install fail the same way on a
// broken catalog instead of running the installer halfway through.
function loadValidCatalog(root) {
  const catalog = readCatalog(root);
  const validation = validateCatalog(catalog);
  if (!validation.ok) {
    throw new CliError(`invalid catalog:\n  ${validation.errors.join('\n  ')}`, 1);
  }
  return catalog;
}

function runList(options, root) {
  const extensions = listExtensions(loadValidCatalog(root));
  if (options.json) {
    console.log(JSON.stringify({ ok: true, root, extensions }, null, 2));
    return;
  }
  if (extensions.length === 0) {
    console.log(`[${TOOL}] catalog is empty`);
    return;
  }
  for (const extension of extensions) {
    console.log(`${extension.name}\t${extension.summary}`);
    console.log(`  ${extension.installer}\t${extension.spec} (${extension.license})`);
  }
}

function runDoctor(options, root) {
  const validation = validateCatalog(readCatalog(root));
  const status = installerStatus();
  const result = {
    ok: validation.ok,
    root,
    errors: validation.errors,
    extensions: validation.entries,
    installers: status,
  };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  for (const name of INSTALLER_NAMES) {
    const info = status[name];
    const label = info.found ? `found: ${info.path}` : `not found (command "${info.command}")`;
    console.log(`${info.found ? '[ok]  ' : '[skip]'} ${name} installer ${label}`);
  }
  for (const entry of result.extensions) {
    const suffix = entry.installer ? ` (${entry.installer})` : '';
    console.log(`${entry.ok ? '[ok]  ' : '[FAIL]'} ${entry.name ?? '(invalid)'}${suffix}`);
  }
  for (const error of validation.errors) console.log(`        error: ${error}`);
  console.log(result.ok ? `[${TOOL}] catalog valid` : `[${TOOL}] catalog validation failed`);
  process.exitCode = result.ok ? 0 : 1;
}

function runInstall(options, root) {
  const catalog = loadValidCatalog(root);
  const { steps } = planInstall({ catalog, names: options.names, all: options.all });

  // A dry run only reports the plan, so it does not require the installer to
  // be installed; a real install verifies availability before running anything.
  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, root, dryRun: true, steps: steps.map(summarizeStep) }, null, 2));
      return;
    }
    for (const step of steps) console.log(`[${TOOL}] would run: ${step.command.join(' ')}`);
    console.log(`[${TOOL}] dry run: nothing installed`);
    return;
  }

  const missing = missingInstallers(steps, { resolve: resolveCommandPath });
  if (missing.length > 0) {
    throw new CliError(`${missing.join(', ')} not found on PATH; install it and retry`, 1);
  }

  const results = executePlan(steps, { run: options.json ? runCaptured : runInherit });
  const ok = results.every((result) => result.ok);
  // executePlan stops at the first failure; surface the steps it never reached
  // so a caller can see the run was incomplete.
  const notAttempted = steps.slice(results.length).map(summarizeStep);
  if (options.json) {
    console.log(JSON.stringify({ ok, root, results: results.map(summarizeResult), notAttempted }, null, 2));
    process.exitCode = ok ? 0 : 1;
    return;
  }
  for (const result of results) {
    console.log(`[${TOOL}] ${result.ok ? 'installed' : 'failed'} ${result.extension} via ${result.installer}`);
    if (!result.ok && result.error) console.log(`[${TOOL}]   ${result.error}`);
  }
  for (const step of notAttempted) console.log(`[${TOOL}] not attempted: ${step.extension} via ${step.installer}`);
  process.exitCode = ok ? 0 : 1;
}

function summarizeStep(step) {
  return { extension: step.extension, installer: step.installer, command: step.command };
}

function summarizeResult(result) {
  const summary = {
    extension: result.extension,
    installer: result.installer,
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
    process.stderr.write(`[${TOOL}] ${error.message}\n`);
  }
  process.exitCode = code;
}
