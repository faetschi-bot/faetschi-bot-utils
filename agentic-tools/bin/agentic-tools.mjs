#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INSTALL_TARGETS,
  copySkillDir,
  listSkillDirs,
  parseFrontmatter,
  targetDir,
  validateAll,
  validateSkill,
} from '../lib/skills.mjs';
import {
  COMMAND_TARGETS,
  commandDest,
  commandTargetDir,
  installCommand,
  listCommands,
  validateAllCommands,
  validateCommand,
} from '../lib/commands.mjs';
import { existsSync, readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');

class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

function usage() {
  console.log(`agentic-tools - reusable skills and commands for AI coding agents.

Usage:
  agentic-tools list [--commands] [options]        list the skills (or commands) in this package
  agentic-tools doctor [options]                   validate every SKILL.md and command, then exit
  agentic-tools install <name...> [options]        copy skills (or commands) into an agent directory
  agentic-tools install --all [options]            copy every skill (or command) in the pack

Options:
  --root <path>        package root to inspect (default: this package)
  --commands           work with the commands pack instead of the skills pack
  --target <name>      install preset: skills: opencode (default), claude, agents;
                       commands: opencode (default), pi, codex
  --global             install to the user-global directory instead of the project
  --dir <path>         explicit destination directory (overrides --target/--global)
  --all                select every skill or command in the pack
  --force              overwrite existing skills or commands
  --dry-run            report what would be installed without writing anything
  --json               print a machine-readable result object
  --help               show this help

Skill targets (project / global):
  opencode   .opencode/skills        ~/.config/opencode/skills
  claude     .claude/skills          ~/.claude/skills
  agents     .agents/skills          ~/.agents/skills

Command targets (project / global):
  opencode   .opencode/commands      ~/.config/opencode/commands
  pi         .pi/prompts             ~/.pi/agent/prompts
  codex      .agents/skills          ~/.agents/skills

Skills live in <root>/skills/<name>/SKILL.md and are copied as whole directories.
Commands live in <root>/commands/<name>.md and are rendered per CLI: a single
markdown file for OpenCode and Pi, a <name>/SKILL.md skill directory for Codex.
doctor checks skills for valid frontmatter (name, description), working relative
links, and in-page anchors, and commands for a description and a non-empty body;
exit code is 0 when everything is valid, 1 otherwise.`);
}

function parse(argv) {
  const o = { names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === 'list' || a === 'doctor' || a === 'install') && o.command === undefined) {
      o.command = a;
      continue;
    }
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--root') o.root = val();
    else if (a === '--target') o.target = val();
    else if (a === '--dir') o.dir = val();
    else if (a === '--json') o.json = true;
    else if (a === '--global') o.global = true;
    else if (a === '--all') o.all = true;
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--commands') o.commands = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new CliError(`Unknown option: ${a}`);
    else o.names.push(a);
  }
  return o;
}

function firstLine(text) {
  const line = String(text || '').trim().split(/\r?\n/)[0];
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

function runList(opts, root) {
  if (opts.commands) {
    const commands = listCommands(root).map((command) => {
      let description = '';
      try {
        description = parseFrontmatter(readFileSync(command.file, 'utf8')).data.description || '';
      } catch {
        /* reported by doctor */
      }
      return { name: command.name, description };
    });
    if (opts.json) {
      console.log(JSON.stringify({ root, commands }, null, 2));
      return;
    }
    if (commands.length === 0) {
      console.log(`[agentic-tools] no commands found under ${root}`);
      return;
    }
    for (const command of commands) console.log(`${command.name}\t${firstLine(command.description)}`);
    return;
  }

  const skills = listSkillDirs(root).map((skill) => {
    let description = '';
    try {
      description = parseFrontmatter(readFileSync(skill.file, 'utf8')).data.description || '';
    } catch {
      /* reported by doctor */
    }
    return { name: skill.name, description };
  });

  if (opts.json) {
    console.log(JSON.stringify({ root, skills }, null, 2));
    return;
  }
  if (skills.length === 0) {
    console.log(`[agentic-tools] no skills found under ${root}`);
    return;
  }
  for (const skill of skills) console.log(`${skill.name}\t${firstLine(skill.description)}`);
}

function runDoctor(opts, root) {
  const skills = validateAll(root).skills;
  const commands = validateAllCommands(root).commands;
  // A partial root (skills only, commands only) is valid when what it has is
  // valid; a root with neither has nothing to validate.
  const ok = (skills.length > 0 || commands.length > 0)
    && skills.every((skill) => skill.ok)
    && commands.every((command) => command.ok);

  if (opts.json) {
    console.log(JSON.stringify({ ok, root, skills, commands }, null, 2));
    process.exitCode = ok ? 0 : 1;
    return;
  }
  if (skills.length === 0 && commands.length === 0) {
    console.error(`[agentic-tools] no skills or commands found under ${root}`);
    process.exitCode = 1;
    return;
  }
  for (const skill of skills) {
    console.log(`${skill.ok ? '[ok]  ' : '[FAIL]'} ${skill.name}`);
    for (const error of skill.errors) console.log(`        error: ${error}`);
    for (const warning of skill.warnings) console.log(`        warn: ${warning}`);
  }
  for (const command of commands) {
    console.log(`${command.ok ? '[ok]  ' : '[FAIL]'} ${command.name}`);
    for (const error of command.errors) console.log(`        error: ${error}`);
  }
  console.log(ok ? '[agentic-tools] all skills and commands valid' : '[agentic-tools] validation failed');
  process.exitCode = ok ? 0 : 1;
}

function selectNames(opts, available, noun) {
  let names = opts.names;
  if (opts.all) {
    if (names.length > 0) throw new CliError(`Cannot combine --all with ${noun} names`);
    names = available.map((entry) => entry.name);
  }
  if (names.length === 0) throw new CliError(`No ${noun}s selected; pass ${noun} names or --all`);
  return names;
}

function reportInstall(opts, root, kind, target, destBase, installed) {
  if (opts.json) {
    console.log(
      JSON.stringify(
        { ok: true, root, kind, target, global: !!opts.global, dir: destBase, dryRun: !!opts.dryRun, installed },
        null,
        2,
      ),
    );
    return;
  }
  for (const item of installed) {
    const verb = opts.dryRun ? 'would install' : item.action === 'overwrite' ? 'updated' : 'installed';
    console.log(`[agentic-tools] ${verb} ${item.name} -> ${item.path}`);
  }
  if (opts.dryRun) console.log('[agentic-tools] dry run: nothing written');
}

function runInstallSkills(opts, root) {
  const target = opts.target || 'opencode';
  if (!opts.dir && !INSTALL_TARGETS[target]) {
    throw new CliError(`Unknown target: ${target} (expected ${Object.keys(INSTALL_TARGETS).join(', ')})`);
  }

  const available = listSkillDirs(root);
  if (available.length === 0) throw new Error(`no skills found under ${root}`);

  const names = selectNames(opts, available, 'skill');
  const byName = new Map(available.map((skill) => [skill.name, skill]));
  const selected = [];
  for (const name of names) {
    const skill = byName.get(name);
    if (!skill) {
      const hint = listCommands(root).some((command) => command.name === name) ? '; did you mean --commands?' : '';
      throw new CliError(`Unknown skill: ${name}${hint} (available: ${available.map((s) => s.name).join(', ')})`);
    }
    selected.push(skill);
  }

  const destBase = opts.dir ? resolve(opts.dir) : targetDir(target, { global: opts.global });

  const problems = [];
  for (const skill of selected) {
    const validation = validateSkill(skill);
    if (!validation.ok) problems.push(`${skill.name}: ${validation.errors.join('; ')}`);
    const dest = join(destBase, skill.name);
    if (existsSync(dest) && !opts.force) {
      problems.push(`${skill.name}: destination already exists (${dest}); use --force to overwrite`);
    }
  }
  if (problems.length > 0) throw new Error(`cannot install:\n  ${problems.join('\n  ')}`);

  const installed = selected.map((skill) => {
    if (opts.dryRun) {
      const dest = join(destBase, skill.name);
      return { name: skill.name, path: dest, action: existsSync(dest) ? 'overwrite' : 'create' };
    }
    return copySkillDir(skill, destBase, { force: !!opts.force });
  });

  reportInstall(opts, root, 'skills', target, destBase, installed);
}

function runInstallCommands(opts, root) {
  const target = opts.target || 'opencode';
  if (!opts.dir && !COMMAND_TARGETS[target]) {
    throw new CliError(`Unknown target: ${target} (expected ${Object.keys(COMMAND_TARGETS).join(', ')})`);
  }

  const available = listCommands(root);
  if (available.length === 0) throw new Error(`no commands found under ${root}`);

  const names = selectNames(opts, available, 'command');
  const byName = new Map(available.map((command) => [command.name, command]));
  const selected = [];
  for (const name of names) {
    const command = byName.get(name);
    if (!command) {
      const hint = listSkillDirs(root).some((skill) => skill.name === name) ? '; drop --commands to install it as a skill' : '';
      throw new CliError(`Unknown command: ${name}${hint} (available: ${available.map((c) => c.name).join(', ')})`);
    }
    selected.push(command);
  }

  const destBase = opts.dir ? resolve(opts.dir) : commandTargetDir(target, { global: opts.global });

  const problems = [];
  for (const command of selected) {
    const validation = validateCommand(command);
    if (!validation.ok) problems.push(`${command.name}: ${validation.errors.join('; ')}`);
    const dest = commandDest(command, destBase, target);
    if (existsSync(dest) && !opts.force) {
      problems.push(`${command.name}: destination already exists (${dest}); use --force to overwrite`);
    }
  }
  if (problems.length > 0) throw new Error(`cannot install:\n  ${problems.join('\n  ')}`);

  const installed = selected.map((command) =>
    installCommand(command, destBase, target, { force: !!opts.force, dryRun: !!opts.dryRun }),
  );

  reportInstall(opts, root, 'commands', target, destBase, installed);
}

function runInstall(opts, root) {
  if (opts.commands) runInstallCommands(opts, root);
  else runInstallSkills(opts, root);
}

function main(opts) {
  const root = resolve(opts.root || packageRoot);
  if (opts.command === 'list') runList(opts, root);
  else if (opts.command === 'doctor') runDoctor(opts, root);
  else if (opts.command === 'install') runInstall(opts, root);
  else usage();
}

let opts;
try {
  opts = parse(process.argv.slice(2));
  if (opts.help) usage();
  else main(opts);
} catch (e) {
  const code = e instanceof CliError ? e.code : 1;
  const json = opts?.json ?? process.argv.includes('--json');
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: e.message }, null, 2) + '\n');
  } else {
    process.stderr.write(`[agentic-tools] ${e.message}\n`);
  }
  process.exitCode = code;
}
