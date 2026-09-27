#!/usr/bin/env node
import { resolve } from 'node:path';
import { CONFIG_FILE, TOOL_NAME } from '../lib/constants.mjs';
import { ConfigError } from '../lib/config.mjs';
import { applyFiles, planSetup, planUpdate, resolveConfig } from '../lib/adoption.mjs';
import { runChecks } from '../lib/checks.mjs';
import { renderCaller, renderStandalone } from '../lib/render.mjs';
import { gitRoot } from '../lib/repo.mjs';
import { VERSION } from '../lib/package-info.mjs';
import { providerNames } from '../lib/providers.mjs';
import { securityChecklist } from '../lib/checklist.mjs';

class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

function usage() {
  console.log(`${TOOL_NAME} - let @mentions run an AI coding agent in your repo.

Usage:
  ${TOOL_NAME} setup [options]    install the config and the GitHub Actions workflow
  ${TOOL_NAME} doctor [options]   check the install, then exit
  ${TOOL_NAME} update [options]   re-render the workflow from the stored config
  ${TOOL_NAME} print [options]    print the workflow to stdout instead of writing it

Options:
  --repo <path>            repository to configure (default: cwd, resolved to the git root)
  --mention <phrase>       trigger phrase to look for, e.g. "@example-bot" (required)
  --model <provider/model> model for the agent, e.g. opencode-go/deepseek-v4.1-flash
  --agent <name>           primary agent to run (default: build)
  --identity <pat|app>     pat: act as the token user (default). app: use the agent GitHub App
  --provider <name>        provider preset for env/secret/model defaults (${providerNames().join(', ')})
  --provider-env <NAME>    env var the provider credential is exported as, e.g. OPENCODE_API_KEY
  --provider-secret <NAME> repository secret holding the provider credential
  --token-secret <NAME>    repository secret holding the GitHub token (identity pat)
  --self-login <login>     login to ignore, so the agent never answers itself
  --allow-users <a,b>      logins allowed to trigger a run; empty means any user with write access
  --ref <ref>              shared workflow ref (default: ${TOOL_NAME}-v1)
  --reusable-repo <o/r>    repo hosting the shared workflow (default: this tool's repo)
  --standalone             render a self-contained workflow instead of calling the shared one
  --allow-writes           let the agent commit and push (default: comment-only)
  --allow-any-writer       allow any write-access user to trigger (default: require --allow-users)
  --share                  publish the agent session (default: off)
  --no-share               do not publish the agent session (default)
  --no-remote              skip the checks that call GitHub via gh
  --force                  overwrite existing files (setup/update only)
  --dry-run                report what would change without writing anything
  --quiet                  print nothing except errors and JSON results
  --json                   print a machine-readable result object
  --version                print the installed ${TOOL_NAME} version
  --help                   show this help

${TOOL_NAME} writes ${CONFIG_FILE} and one workflow file (by default
.github/workflows/${TOOL_NAME}.yml) that calls a reusable workflow maintained
once in this tool's repository. Put the mention phrase, the secrets, and who may
trigger it in ${CONFIG_FILE}, then commit both files and add the named repository
secrets. Secure defaults: the agent is comment-only (no code push), a trigger
allowlist is required, and session sharing is off. Exit code is 0 on success, 1
when a doctor check fails, 2 on bad usage.`);
}

function parse(argv) {
  const o = { allowUsers: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (
      (a === 'setup' || a === 'doctor' || a === 'update' || a === 'print') &&
      o.command === undefined
    ) {
      o.command = a;
      continue;
    }
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`Missing value for ${a}`);
      return v;
    };
    if (a === '--repo') o.repo = val();
    else if (a === '--mention') o.mention = val();
    else if (a === '--model') o.model = val();
    else if (a === '--agent') o.agent = val();
    else if (a === '--identity') o.identity = val();
    else if (a === '--provider') o.provider = val();
    else if (a === '--provider-env') o.providerEnv = val();
    else if (a === '--provider-secret') o.providerSecret = val();
    else if (a === '--token-secret') o.tokenSecret = val();
    else if (a === '--self-login') o.selfLogin = val();
    else if (a === '--allow-users') o.allowUsers = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--ref') o.ref = val();
    else if (a === '--reusable-repo') o.reusableRepo = val();
    else if (a === '--standalone') o.standalone = true;
    else if (a === '--allow-writes') o.allowWrites = true;
    else if (a === '--allow-any-writer') o.allowAnyWriter = true;
    else if (a === '--share') o.share = true;
    else if (a === '--no-share') o.share = false;
    else if (a === '--no-remote') o.noRemote = true;
    else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--json') o.json = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new CliError(`Unknown option: ${a}`);
    else throw new CliError(`Unknown argument: ${a}`);
  }
  return o;
}

function requireRoot(opts) {
  const base = resolve(opts.repo || process.cwd());
  const root = gitRoot(base);
  if (!root) throw new CliError(`${base} is not inside a git work tree`);
  return root;
}

// The allowlist is the main spend control; require it unless the user explicitly
// opts out. `doctor` also fails on an empty allowlist.
function requireAllowlist(config, opts) {
  if (config.allowUsers.length === 0 && opts.allowAnyWriter !== true) {
    throw new CliError(
      'set --allow-users to name who may trigger runs, or pass --allow-any-writer to allow any write-access user',
    );
  }
}

function runSetup(opts) {
  const root = requireRoot(opts);
  const { config, files } = planSetup({ dir: root, flags: opts });
  requireAllowlist(config, opts);
  const { written, skipped } = applyFiles(files, { force: opts.force, dryRun: opts.dryRun });
  const security = securityChecklist(config);

  if (opts.json) {
    console.log(
      JSON.stringify(
        { ok: true, dir: root, config, security, written: written.map((f) => f.path), skipped: skipped.map((f) => f.path), dryRun: opts.dryRun === true },
        null,
        2,
      ),
    );
  } else if (!opts.quiet) {
    for (const file of written) console.log(`[${TOOL_NAME}] ${opts.dryRun ? 'would write' : 'wrote'} ${file.path}`);
    for (const file of skipped) console.log(`[${TOOL_NAME}] kept existing ${file.path} (use --force to overwrite)`);
    console.log(`[${TOOL_NAME}] security checklist - do these before the first mention:`);
    security.forEach((item, index) => console.log(`[${TOOL_NAME}]   ${index + 1}. ${item}`));
    console.log(`[${TOOL_NAME}] then verify and commit: ${TOOL_NAME} doctor --json`);
  }
}

function runUpdate(opts) {
  const root = requireRoot(opts);
  const { config, files } = planUpdate({ dir: root, flags: opts });
  requireAllowlist(config, opts);
  const { written, skipped } = applyFiles(files, { force: true, dryRun: opts.dryRun });
  if (opts.json) {
    console.log(
      JSON.stringify(
        { ok: true, dir: root, config, security: securityChecklist(config), written: written.map((f) => f.path), skipped: skipped.map((f) => f.path), dryRun: opts.dryRun === true },
        null,
        2,
      ),
    );
  } else if (!opts.quiet) {
    for (const file of written) console.log(`[${TOOL_NAME}] ${opts.dryRun ? 'would update' : 'updated'} ${file.path}`);
  }
}

function runPrint(opts) {
  const base = resolve(opts.repo || process.cwd());
  const dir = gitRoot(base) || base;
  const config = resolveConfig(dir, opts);
  process.stdout.write(config.standalone ? renderStandalone(config) : renderCaller(config));
}

function runDoctor(opts) {
  const dir = resolve(opts.repo || process.cwd());
  const result = runChecks({ dir, flags: opts, noRemote: opts.noRemote === true });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!opts.quiet) {
    for (const c of result.checks) {
      const tag = c.skipped ? '[skip]' : c.severity === 'warning' && !c.ok ? '[WARN]' : c.ok ? '[ok]  ' : '[FAIL]';
      console.log(`${tag} ${c.name}: ${c.detail}`);
      if (!c.ok && c.hint) console.log(`        hint: ${c.hint}`);
    }
    console.log(result.ok ? `[${TOOL_NAME}] install looks ready` : `[${TOOL_NAME}] install needs attention`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

function main(opts) {
  if (opts.command === 'setup') runSetup(opts);
  else if (opts.command === 'doctor') runDoctor(opts);
  else if (opts.command === 'update') runUpdate(opts);
  else if (opts.command === 'print') runPrint(opts);
  else usage();
}

let opts;
try {
  opts = parse(process.argv.slice(2));
  if (opts.help) usage();
  else if (opts.version) console.log(`${TOOL_NAME} ${VERSION}`);
  else if (opts.command === undefined) usage();
  else main(opts);
} catch (e) {
  const code = e instanceof CliError || e instanceof ConfigError ? (e.code ?? 2) : 1;
  const json = opts?.json ?? process.argv.includes('--json');
  if (json) process.stdout.write(`${JSON.stringify({ ok: false, error: e.message }, null, 2)}\n`);
  else process.stderr.write(`[${TOOL_NAME}] ${e.message}\n`);
  process.exitCode = code;
}
