#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSkillDirs, parseFrontmatter, validateAll } from '../lib/skills.mjs';
import { readFileSync } from 'node:fs';

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
  agentic-tools list [options]      list the skills in this package
  agentic-tools doctor [options]    validate every SKILL.md, then exit

Options:
  --root <path>        package root to inspect (default: this package)
  --json               print a machine-readable result object
  --help               show this help

Skills live in <root>/skills/<name>/SKILL.md. doctor checks each one for valid
frontmatter (name, description) and working relative links. Exit code is 0 when
every skill is valid, 1 otherwise.`);
}

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === 'list' || a === 'doctor') && o.command === undefined) {
      o.command = a;
      continue;
    }
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--root') o.root = val();
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new CliError(`Unknown option: ${a}`);
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

function main(opts) {
  const root = resolve(opts.root || packageRoot);
  if (opts.command === 'list') runList(opts, root);
  else if (opts.command === 'doctor') runDoctor(opts, root);
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
