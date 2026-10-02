import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './core/errors.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The absolute CLI path is baked into the generated adapter so the harness can
// spawn it regardless of the plugin's own working directory.
export const CLI_PATH = join(PACKAGE_ROOT, 'bin', 'session-search.mjs');

export const ADAPTERS = {
  opencode: {
    template: join(PACKAGE_ROOT, 'adapters', 'opencode', 'plugin.js'),
    project: ['.opencode', 'plugins', 'session-search.js'],
    global: ['.config', 'opencode', 'plugins', 'session-search.js'],
  },
  pi: {
    template: join(PACKAGE_ROOT, 'adapters', 'pi', 'extension.ts'),
    project: ['.pi', 'extensions', 'session-search.ts'],
    global: ['.pi', 'agent', 'extensions', 'session-search.ts'],
  },
};

export function renderAdapter(harness, { cliPath = CLI_PATH, cacheRoot = '' } = {}) {
  const spec = ADAPTERS[harness];
  if (!spec) throw new CliError(`unknown harness: ${harness} (expected opencode or pi)`);
  return readFileSync(spec.template, 'utf8')
    .replaceAll('__SESSION_SEARCH_BIN__', cliPath)
    .replaceAll('__SESSION_SEARCH_CACHE__', cacheRoot);
}

export function adapterTarget(harness, { global = false, cwd = process.cwd(), home = homedir() } = {}) {
  const spec = ADAPTERS[harness];
  if (!spec) throw new CliError(`unknown harness: ${harness} (expected opencode or pi)`);
  return join(global ? home : cwd, ...(global ? spec.global : spec.project));
}

export function installAdapter(harness, { global = false, cwd, home, cacheRoot = '', force = false, dryRun = false } = {}) {
  const dest = adapterTarget(harness, { global, cwd, home });
  const content = renderAdapter(harness, { cacheRoot });
  const existed = existsSync(dest);
  if (existed && !force) throw new CliError(`destination already exists: ${dest} (use --force to overwrite)`);
  if (!dryRun) {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, { mode: 0o600 });
  }
  return { harness, path: dest, action: existed ? 'overwrite' : 'create', dryRun };
}

// A copy-pasteable MCP config snippet for users who prefer not to install the
// adapter (for example when a third-party Pi MCP extension replaced built-in MCP).
export function mcpConfigSnippet(harness, { cliPath = CLI_PATH, cacheRoot = '' } = {}) {
  const args = ['mcp'];
  if (cacheRoot) args.push('--cache', cacheRoot);
  if (harness === 'opencode') {
    return {
      mcp: { servers: { session_search: { type: 'local', command: [process.execPath, cliPath, ...args], codemode: false } } },
    };
  }
  return {
    mcpServers: {
      session_search: {
        command: process.execPath,
        args: [cliPath, ...args],
        exposure: 'direct',
        description: 'Search local coding-agent session history',
      },
    },
  };
}
