// Planning and execution of native extension installs.
//
// Each catalog source names the harness that owns installation, so this module
// turns a selection into concrete harness commands and runs them. Planning and
// the PATH lookup are pure; tests inject both, so no real installer is needed.
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { CliError } from './errors.mjs';
import { HARNESSES, INSTALLERS } from './harnesses.mjs';

export { INSTALLERS };

// Accepts "pi", "omp", "both", or "auto". `auto` reports the harnesses whose
// CLI is on PATH; an empty result is left for the caller to explain.
export function resolveHarnesses(requested, { isAvailable = (command) => Boolean(resolveCommandPath(command)) } = {}) {
  if (![...HARNESSES, 'both', 'auto'].includes(requested)) {
    throw new CliError(`Unknown --harness: ${requested} (expected ${[...HARNESSES, 'both', 'auto'].join(', ')})`);
  }
  if (HARNESSES.includes(requested)) return { harnesses: [requested] };
  if (requested === 'both') return { harnesses: [...HARNESSES] };
  return { harnesses: HARNESSES.filter((harness) => isAvailable(INSTALLERS[harness].command)) };
}

export function harnessStatus({ resolve = (command) => resolveCommandPath(command) } = {}) {
  const status = {};
  for (const harness of HARNESSES) {
    const command = INSTALLERS[harness].command;
    const path = resolve(command);
    status[harness] = { command, found: Boolean(path), path: path ?? null };
  }
  return status;
}

// Finds a command on PATH without spawning it. Injectable so tests need no real
// binaries. Windows resolves PATHEXT; other platforms match the bare name.
export function resolveCommandPath(
  command,
  { pathEnv = process.env.PATH ?? '', platform = process.platform, isExecutable = defaultIsExecutable } = {},
) {
  if (command.includes('/') || command.includes('\\')) {
    return isExecutable(command) ? command : undefined;
  }
  const separator = platform === 'win32' ? ';' : ':';
  const suffixes = platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of pathEnv.split(separator)) {
    if (!dir) continue;
    for (const suffix of suffixes) {
      const candidate = join(dir, `${command}${suffix}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

function defaultIsExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Pure: turns a selection into ordered install steps plus the harness gaps it
// skips. Throws a usage error for an unknown name, an ambiguous selection, or
// --local on a harness without local scope.
export function planInstall({ catalog, names = [], all = false, harnesses, local = false }) {
  const extensions = catalog?.extensions ?? [];
  if (extensions.length === 0) throw new CliError('catalog has no extensions', 1);
  if (all && names.length > 0) throw new CliError('cannot combine --all with extension names');
  const selected = all ? extensions.map((extension) => extension.name) : names;
  if (selected.length === 0) throw new CliError('no extensions selected; pass extension names or --all');
  if (!Array.isArray(harnesses) || harnesses.length === 0) throw new CliError('no harness selected', 1);

  const byName = new Map(extensions.map((extension) => [extension.name, extension]));
  const steps = [];
  const skipped = [];
  for (const name of selected) {
    const extension = byName.get(name);
    if (!extension) {
      throw new CliError(`unknown extension: ${name} (available: ${[...byName.keys()].join(', ')})`);
    }
    for (const harness of harnesses) {
      const source = extension.sources?.[harness];
      if (!source) {
        skipped.push({ extension: name, harness, reason: 'not available for this harness' });
        continue;
      }
      const installer = INSTALLERS[source.installer];
      if (!installer) throw new CliError(`${name}: unknown installer "${source.installer}"`, 1);
      if (local && !installer.supportsLocal) {
        throw new CliError(
          `${name}: --local is not supported by the ${harness} installer (its installs are global); drop --local or use --harness pi`,
        );
      }
      steps.push({
        extension: name,
        harness,
        installer: source.installer,
        command: [installer.command, ...installer.buildArgs({ spec: source.spec, local })],
      });
    }
  }
  return { steps, skipped };
}

export function missingInstallers(steps, { resolve = (command) => resolveCommandPath(command) } = {}) {
  const missing = new Set();
  for (const step of steps) {
    if (!resolve(step.command[0])) missing.add(step.command[0]);
  }
  return [...missing];
}

// Runs the steps in order, stopping at the first failure so a later harness is
// not installed after an earlier one broke. `run(command, args)` is injected.
export function executePlan(steps, { run }) {
  if (typeof run !== 'function') throw new CliError('executePlan requires a run function', 1);
  const results = [];
  for (const step of steps) {
    const [command, ...args] = step.command;
    const outcome = run(command, args) ?? {};
    const status = typeof outcome.status === 'number' ? outcome.status : 1;
    results.push({
      extension: step.extension,
      harness: step.harness,
      installer: step.installer,
      command: step.command,
      status,
      ok: status === 0,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      error: outcome.error,
    });
    if (status !== 0) break;
  }
  return results;
}

// Interactive installs stream the native CLI so prompts and progress are
// visible. JSON mode captures instead, so stdout stays one JSON document.
export function runInherit(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  return { status: result.error ? 1 : result.status ?? 1, error: result.error?.message };
}

export function runCaptured(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.error ? 1 : result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
  };
}
