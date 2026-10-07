// Planning and execution of native OpenCode plugin installs.
//
// Each catalog entry names its installer, so this module turns a selection
// into concrete installer commands and runs them. Planning and the PATH
// lookup are pure; tests inject both, so no real installer is needed.
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { CliError } from './errors.mjs';
import { INSTALLERS, INSTALLER_NAMES } from './installers.mjs';

export { INSTALLERS };

// Reports whether each known installer's command is on PATH. A missing command
// is reported, not thrown: `doctor` still works on a machine without OpenCode,
// and `--dry-run` needs no installer at all.
export function installerStatus({ resolve = (command) => resolveCommandPath(command) } = {}) {
  const status = {};
  for (const name of INSTALLER_NAMES) {
    const command = INSTALLERS[name].command;
    const path = resolve(command);
    status[name] = { command, found: Boolean(path), path: path ?? null };
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

// Pure: turns a selection into ordered install steps. Throws a usage error for
// an unknown name, an ambiguous selection, or an unknown installer.
export function planInstall({ catalog, names = [], all = false }) {
  const extensions = catalog?.extensions ?? [];
  if (extensions.length === 0) throw new CliError('catalog has no extensions', 1);
  if (all && names.length > 0) throw new CliError('cannot combine --all with extension names');
  const selected = all ? extensions.map((extension) => extension.name) : names;
  if (selected.length === 0) throw new CliError('no extensions selected; pass extension names or --all');

  const byName = new Map(extensions.map((extension) => [extension.name, extension]));
  const steps = [];
  for (const name of selected) {
    const extension = byName.get(name);
    if (!extension) {
      throw new CliError(`unknown extension: ${name} (available: ${[...byName.keys()].join(', ')})`);
    }
    const installer = INSTALLERS[extension.installer];
    if (!installer) throw new CliError(`${name}: unknown installer "${extension.installer}"`, 1);
    steps.push({
      extension: name,
      installer: extension.installer,
      command: [installer.command, ...installer.buildArgs({ spec: extension.spec, args: extension.args })],
    });
  }
  return { steps };
}

export function missingInstallers(steps, { resolve = (command) => resolveCommandPath(command) } = {}) {
  const missing = new Set();
  for (const step of steps) {
    if (!resolve(step.command[0])) missing.add(step.command[0]);
  }
  return [...missing];
}

// Runs the steps in order, stopping at the first failure so a later plugin is
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
