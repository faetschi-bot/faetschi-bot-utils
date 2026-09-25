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
  console.log(`agentic-tools - reusable skills and hooks for AI coding agents.

Usage:
  agentic-tools list [options]                 list the skills in this package
  agentic-tools doctor [options]               validate every SKILL.md, then exit
  agentic-tools install <skill...> [options]   copy skills into an agent skills dir
  agentic-tools install --all [options]        copy every skill in the pack

Options:
  --root <path>        package root to inspect (default: this package)
  --target <name>      install preset: opencode (default), claude, agents
  --global             install to the user-global directory instead of the project
  --dir <path>         explicit destination skills dir (overrides --target/--global)
  --all                select every skill in the pack
  --force              overwrite existing skill directories
  --dry-run            report what would be installed without writing anything
  --json               print a machine-readable result object
  --help               show this help

Install targets (project / global):
  opencode   .opencode/skills        ~/.config/opencode/skills
  claude     .claude/skills          ~/.claude/skills
  agents     .agents/skills          ~/.agents/skills

Skills live in <root>/skills/<name>/SKILL.md. install copies each selected skill
directory (SKILL.md plus any supporting files) to <dir>/<name>. doctor checks
each skill for valid frontmatter (name, description), working relative links, and
in-page anchors; exit code is 0 when every skill is valid, 1 otherwise.`);
}

function parse(argv) {
  const o = { skills: [] };
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
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new CliError(`Unknown option: ${a}`);
    else o.skills.push(a);
  }
  return o;
}

function firstLine(text) {
  const line = String(text || '').trim().split(/\r?\n/)[0];
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

function runList(opts, root) {
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
  const { ok, skills } = validateAll(root);
  if (opts.json) {
    console.log(JSON.stringify({ ok, root, skills }, null, 2));
    process.exitCode = ok ? 0 : 1;
    return;
  }
  if (skills.length === 0) {
    console.error(`[agentic-tools] no skills found under ${root}`);
    process.exitCode = 1;
    return;
  }
  for (const skill of skills) {
    console.log(`${skill.ok ? '[ok]  ' : '[FAIL]'} ${skill.name}`);
    for (const error of skill.errors) console.log(`        error: ${error}`);
    for (const warning of skill.warnings) console.log(`        warn: ${warning}`);
  }
  console.log(ok ? '[agentic-tools] all skills valid' : '[agentic-tools] skill validation failed');
  process.exitCode = ok ? 0 : 1;
}

function runInstall(opts, root) {
  const target = opts.target || 'opencode';
  if (!opts.dir && !INSTALL_TARGETS[target]) {
    throw new CliError(`Unknown target: ${target} (expected ${Object.keys(INSTALL_TARGETS).join(', ')})`);
  }

  const available = listSkillDirs(root);
  if (available.length === 0) throw new Error(`no skills found under ${root}`);

  let names = opts.skills;
  if (opts.all) {
    if (names.length > 0) throw new CliError('Cannot combine --all with skill names');
    names = available.map((skill) => skill.name);
  }
  if (names.length === 0) throw new CliError('No skills selected; pass skill names or --all');

  const byName = new Map(available.map((skill) => [skill.name, skill]));
  const selected = [];
  for (const name of names) {
    const skill = byName.get(name);
    if (!skill) {
      throw new CliError(`Unknown skill: ${name} (available: ${available.map((s) => s.name).join(', ')})`);
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

  if (opts.json) {
    console.log(
      JSON.stringify(
        { ok: true, root, target, global: !!opts.global, dir: destBase, dryRun: !!opts.dryRun, installed },
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
