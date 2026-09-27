// Install/update planning and file writing.
//
// `plan*` functions are pure: they resolve a config and render content without
// touching disk, so `--dry-run`, tests, and `print` all share them. `applyFiles`
// is the only writer.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CONFIG_FILE } from './constants.mjs';
import { ConfigError, buildConfig, readConfig, serializeConfig, validateConfig, wantsStandalone } from './config.mjs';
import { renderCaller, renderStandalone } from './render.mjs';

function renderWorkflow(config) {
  return wantsStandalone(config) ? renderStandalone(config) : renderCaller(config);
}

function assertValid(config) {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new ConfigError(errors.join('; '));
  }
  return config;
}

/**
 * Resolve the config for a target directory: existing file merged with flags,
 * then validated.
 */
export function resolveConfig(dir, flags = {}) {
  const existing = readConfig(dir);
  return assertValid(buildConfig({ existing, flags }));
}

/** Plan a `setup`: the config file plus the rendered caller/standalone workflow. */
export function planSetup({ dir, flags = {} }) {
  const config = resolveConfig(dir, flags);
  return {
    config,
    files: [
      { path: join(dir, CONFIG_FILE), content: serializeConfig(config) },
      { path: join(dir, config.workflow.path), content: renderWorkflow(config) },
    ],
  };
}

/** Plan an `update`: re-render both files from the stored config (and flags). */
export function planUpdate({ dir, flags = {} }) {
  const existing = readConfig(dir);
  if (existing === null) {
    throw new ConfigError(`no ${CONFIG_FILE} here; run "mention-agent setup" first`);
  }
  return planSetup({ dir, flags });
}

/**
 * Write planned files. Existing files are left alone unless `force`; `dryRun`
 * reports what would change without writing.
 *
 * @returns {{ written: object[], skipped: object[] }}
 */
export function applyFiles(files, { force = false, dryRun = false } = {}) {
  const written = [];
  const skipped = [];
  for (const file of files) {
    const existed = existsSync(file.path);
    if (existed && !force) {
      skipped.push({ ...file, existed });
      continue;
    }
    if (!dryRun) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.content);
    }
    written.push({ ...file, existed, dryRun });
  }
  return { written, skipped };
}
