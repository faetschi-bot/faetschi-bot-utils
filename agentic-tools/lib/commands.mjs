import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { MAX_DESCRIPTION, parseFrontmatter } from './skills.mjs';

export const COMMANDS_DIR = 'commands';
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Where each CLI reads slash-command prompts from, and the shape it expects:
//   'file'  installs <dir>/<name>.md        (OpenCode commands, Pi prompt templates)
//   'skill' installs <dir>/<name>/SKILL.md  (Codex skills)
export const COMMAND_TARGETS = {
  opencode: { project: ['.opencode', 'commands'], global: ['.config', 'opencode', 'commands'], shape: 'file' },
  pi: { project: ['.pi', 'prompts'], global: ['.pi', 'agent', 'prompts'], shape: 'file' },
  codex: { project: ['.agents', 'skills'], global: ['.agents', 'skills'], shape: 'skill' },
};

export function commandTargetDir(target, { global = false, cwd = process.cwd(), home = homedir() } = {}) {
  const spec = COMMAND_TARGETS[target];
  if (!spec) return undefined;
  return join(global ? home : cwd, ...(global ? spec.global : spec.project));
}

export function listCommands(root) {
  const dir = join(root, COMMANDS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => ({
      name: entry.name.slice(0, -3),
      dir: join(dir, entry.name),
      file: join(dir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function frontmatterBlock(entries) {
  return `---\n${entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n`;
}

// Render one canonical command file for one CLI target. Each CLI gets only the
// frontmatter it documents; Pi additionally gets a `$@` trailer so text typed
// after the command reaches the prompt (OpenCode appends it after a blank line
// when the template has no placeholder; Codex delivers the user's message
// alongside the skill).
export function renderCommand(command, target) {
  const spec = COMMAND_TARGETS[target];
  if (!spec) throw new Error(`unknown command target: ${target}`);
  const text = readFileSync(command.file, 'utf8');
  const parsed = parseFrontmatter(text);
  const body = (parsed.body ?? '').trim();
  const description = parsed.data.description ?? '';
  const entries = spec.shape === 'skill'
    ? [['name', command.name], ['description', description]]
    : [['description', description]];
  if (target === 'pi' && parsed.data['argument-hint']) {
    entries.push(['argument-hint', parsed.data['argument-hint']]);
  }
  const trailer = target === 'pi' ? '\n$@\n' : '\n';
  return `${frontmatterBlock(entries)}\n${body}${trailer}`;
}

export function commandDest(command, destBase, target) {
  const spec = COMMAND_TARGETS[target];
  if (!spec) throw new Error(`unknown command target: ${target}`);
  return spec.shape === 'skill'
    ? join(destBase, command.name, 'SKILL.md')
    : join(destBase, `${command.name}.md`);
}

export function validateCommand(command) {
  const errors = [];
  if (!NAME_RE.test(command.name)) {
    errors.push(`name "${command.name}" must be lowercase kebab-case`);
  }
  if (!existsSync(command.file)) {
    return { name: command.name, ok: false, errors: ['missing command file'] };
  }
  const text = readFileSync(command.file, 'utf8');
  const parsed = parseFrontmatter(text);
  errors.push(...parsed.errors);

  if (!parsed.data.description) errors.push('frontmatter: missing "description"');
  else if (parsed.data.description.length > MAX_DESCRIPTION) {
    errors.push(`description is ${parsed.data.description.length} chars (max ${MAX_DESCRIPTION})`);
  }

  const body = (parsed.body ?? '').trim();
  if (!body) errors.push('empty command body');
  if (body.includes('{{')) errors.push('unresolved template variable in body');

  return { name: command.name, ok: errors.length === 0, errors };
}

export function validateAllCommands(root) {
  const commands = listCommands(root).map(validateCommand);
  return { ok: commands.length > 0 && commands.every((command) => command.ok), commands };
}

export function installCommand(command, destBase, target, { force = false, dryRun = false } = {}) {
  const dest = commandDest(command, destBase, target);
  const existed = existsSync(dest);
  if (existed && !force) {
    throw new Error(`destination already exists: ${dest} (use --force to overwrite)`);
  }
  if (dryRun) {
    return { name: command.name, path: dest, action: existed ? 'overwrite' : 'create' };
  }
  const content = renderCommand(command, target);
  mkdirSync(dirname(dest), { recursive: true });
  if (COMMAND_TARGETS[target].shape === 'skill' && existed) {
    // Drop the old skill directory so a forced update leaves no stale files.
    rmSync(dirname(dest), { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
  }
  writeFileSync(dest, content);
  return { name: command.name, path: dest, action: existed ? 'overwrite' : 'create' };
}
