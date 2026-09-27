#!/usr/bin/env node
import { resolve } from 'node:path';
import { repoRoot, runChecks, writeReleaseConfig } from '../lib/checks.mjs';
import { readOutboundConfig, scaffoldSetup } from '../lib/adoption.mjs';
import metadata from '../package.json' with { type: 'json' };

const { version } = metadata;

class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

function usage() {
  console.log(`outbound - clean, PR-based release changelogs.

Usage:
  outbound doctor [options]     check the repo's release hygiene, then exit
  outbound init [options]       write a .github/release.yml, then exit
  outbound setup [options]      scaffold a complete release setup, then exit

Options:
  --repo <path>        repository to check or configure (default: cwd, resolved to the git root)
  --tag-prefix <p>     also verify tags named <p><version> exist
  --release-branch <b> release branch (setup/config default: main)
  --package <path>     version file (setup/config default: package.json)
  --workflow <path>    release workflow path (setup default: .github/workflows/release.yml)
  --no-remote          skip the checks that call GitHub via gh
  --quiet              print nothing except JSON errors/results
  --force              overwrite generated files (init/setup only)
  --json               print a machine-readable result object
  --version            print the installed outbound version
  --help               show this help

outbound inspects the current repo and reports whether GitHub can produce a
clean changelog from it: is .github/release.yml present and valid, does a
workflow create releases with --generate-notes and "contents: write", do the
labels it references exist on the repo, do recent merged PR titles read as
changelog lines, and does the default branch require PRs.

Exit code is 0 when every check passes (or is skipped), 1 when any fails.`);
}

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === 'doctor' || a === 'init' || a === 'setup') && o.command === undefined) {
      o.command = a;
      continue;
    }
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--repo') o.repo = val();
    else if (a === '--tag-prefix') o.tagPrefix = val();
    else if (a === '--release-branch') o.releaseBranch = val();
    else if (a === '--package') o.packagePath = val();
    else if (a === '--workflow') o.workflow = val();
    else if (a === '--no-remote') o.noRemote = true;
    else if (a === '--force') o.force = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--json') o.json = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new CliError(`Unknown option: ${a}`);
  }
  return o;
}

function runDoctor(opts) {
  const dir = repoRoot(resolve(opts.repo || process.cwd()));
  const { ok, checks } = runChecks({ dir, tagPrefix: opts.tagPrefix, packagePath: opts.packagePath, releaseBranch: opts.releaseBranch, noRemote: opts.noRemote });
  const skipped = checks.filter((c) => c.skipped).length;

  if (opts.json) {
    console.log(JSON.stringify({ ok, dir, skipped, checks }, null, 2));
  } else if (!opts.quiet) {
    for (const c of checks) {
      const tag = c.skipped ? '[skip]' : c.severity === 'warning' ? '[WARN]' : c.ok ? '[ok]  ' : '[FAIL]';
      console.log(`${tag} ${c.name}: ${c.detail}`);
      if (!c.ok && c.hint) console.log(`        hint: ${c.hint}`);
      else if (c.skipped && c.hint) console.log(`        note: ${c.hint}`);
    }
    console.log(ok ? '[outbound] repo looks ready to release' : '[outbound] release hygiene needs work');
  }
  process.exitCode = ok ? 0 : 1;
}

function runInit(opts) {
  const dir = repoRoot(resolve(opts.repo || process.cwd()));
  const res = writeReleaseConfig(dir, { force: opts.force });
  if (res.written) {
    console.log(`[outbound] wrote ${res.path}`);
    console.log('[outbound] next: label PRs, open every change as a PR, and protect the default branch.');
  } else {
    console.log(`[outbound] ${res.path} already exists (use --force to overwrite)`);
  }
}

function runSetup(opts) {
  const dir = repoRoot(resolve(opts.repo || process.cwd()));
  const res = scaffoldSetup(dir, { force: opts.force, releaseBranch: opts.releaseBranch, tagPrefix: opts.tagPrefix, packagePath: opts.packagePath, workflow: opts.workflow });
  const releaseConfig = writeReleaseConfig(dir, { force: opts.force });
  if (releaseConfig.written) res.files.unshift(releaseConfig.path);
  if (opts.json) console.log(JSON.stringify({ ok: true, dir, config: res.config, written: res.files }, null, 2));
  else if (!opts.quiet) {
    for (const path of res.files) console.log(`[outbound] wrote ${path}`);
    if (!res.files.length) console.log('[outbound] setup already exists (use --force to overwrite)');
    console.log('[outbound] next: run outbound doctor, then review and commit the generated files.');
  }
}

function main(opts) {
  if (opts.command === 'init') runInit(opts);
  else if (opts.command === 'setup') runSetup(opts);
  else if (opts.command === 'doctor') runDoctor(opts);
  else usage();
}

let opts;
try {
  opts = parse(process.argv.slice(2));
  if (opts.help) usage();
  else if (opts.version) console.log(`outbound ${version}`);
  else main(opts);
} catch (e) {
  const code = e instanceof CliError ? e.code : 1;
  const json = opts?.json ?? process.argv.includes('--json');
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: e.message }, null, 2) + '\n');
  } else {
    process.stderr.write(`[outbound] ${e.message}\n`);
  }
  process.exitCode = code;
}
