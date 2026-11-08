import { existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  attachmentMarkdown,
  managedCommentContent,
  readPng,
  uploadPullRequestAttachment,
  upsertManagedPullRequestComment,
  validateOrganization,
} from '../azure-devops.mjs';
import { CliError } from '../errors.mjs';

export const name = 'ado';
export const summary = 'Prepare or publish a visual artifact to Azure DevOps';
export const needsBrowser = false;

export function usage() {
  return `visual-shot ado <prepare|publish> <image.png> [options]

Prepare MCP attachment arguments without network access:
  visual-shot ado prepare <image.png> --project <project> --out <payload.json> --json

Publish to a pull request using SYSTEM_ACCESSTOKEN (or --token-env):
  visual-shot ado publish <image.png> --organization <url> --project <project> \\
    --repository <repoIdOrName> --pr <positive-id> [--alt <text>] \\
    [--token-env SYSTEM_ACCESSTOKEN] [--comment] --json

The PNG must be a regular file: prepare accepts up to 4 MiB and publish up to
20 MiB. Publish uses the native
Azure DevOps PR attachment API; --comment creates or updates only its managed
file marker thread. No Azure CLI or browser setup is used.`;
}

export function parse(argv) {
  const mode = argv[0];
  const options = { mode, image: null };
  if (mode === '--help' || mode === '-h') return { help: true };

  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined || next.startsWith('--')) throw new CliError(`Missing value for ${argument}`);
      return next;
    };
    if (argument === '--project') options.project = value();
    else if (argument === '--out') options.out = value();
    else if (argument === '--organization') options.organization = value();
    else if (argument === '--repository') options.repository = value();
    else if (argument === '--pr') options.pullRequestId = value();
    else if (argument === '--alt') options.alt = value();
    else if (argument === '--token-env') options.tokenEnv = value();
    else if (argument === '--comment') options.comment = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('-')) throw new CliError(`Unknown option: ${argument}`);
    else if (options.image === null) options.image = argument;
    else throw new CliError(`Unexpected argument: ${argument}`);
  }
  return options;
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new CliError(`--${name} must be a non-empty value without surrounding whitespace`);
  }
  return value;
}

export function validate(options) {
  if (options.help) return options;
  if (!['prepare', 'publish'].includes(options.mode)) {
    throw new CliError('expected subcommand: prepare or publish');
  }
  if (!options.image) throw new CliError('missing image input');
  const plan = { ...options };

  if (options.mode === 'prepare') {
    if (options.organization || options.repository || options.pullRequestId || options.alt || options.tokenEnv || options.comment) {
      throw new CliError('publish options cannot be used with ado prepare');
    }
    plan.project = requiredString(options.project, 'project');
    if (!options.out) throw new CliError('missing --out for ado prepare');
    if (resolve(options.image) === resolve(options.out)) throw new CliError('--out must differ from the image input');
    if (existsSync(options.out) && existsSync(options.image)) {
      const outputInfo = statSync(options.out);
      const inputInfo = statSync(options.image);
      if (outputInfo.dev === inputInfo.dev && outputInfo.ino === inputInfo.ino) {
        throw new CliError('--out must not resolve to the image input');
      }
    }
  } else {
    if (options.out) throw new CliError('--out is only valid with ado prepare');
    plan.project = requiredString(options.project, 'project');
    plan.repository = requiredString(options.repository, 'repository');
    validateOrganization(options.organization);
    if (!/^[1-9]\d*$/.test(options.pullRequestId ?? '') || Number(options.pullRequestId) > 2_147_483_647) {
      throw new CliError('--pr must be a positive 32-bit integer');
    }
    plan.pullRequestId = Number(options.pullRequestId);
    plan.tokenEnv = options.tokenEnv ?? 'SYSTEM_ACCESSTOKEN';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(plan.tokenEnv)) throw new CliError('--token-env must be an environment variable name');
  }
  return plan;
}

function printResult(result, json) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else if (result.markdown) {
    console.log(result.markdown);
    if (!result.ok) console.error(`[visual-shot] ${result.error}`);
  }
  else console.log(`[visual-shot] prepared ${result.fileName} for Azure DevOps`);
}

export async function run(plan, ctx = {}) {
  if (plan.mode === 'prepare') {
    const image = readPng(plan.image, 4 * 1024 * 1024);
    const payload = {
      project: plan.project,
      fileName: image.fileName,
      content: image.bytes.toString('base64'),
    };
    writeFileSync(plan.out, `${JSON.stringify(payload, null, 2)}\n`);
    printResult({ ok: true, out: resolve(plan.out), project: plan.project, fileName: image.fileName, sizeBytes: image.sizeBytes }, plan.json);
    return 0;
  }

  const image = readPng(plan.image);
  const token = process.env[plan.tokenEnv];
  const attachment = await uploadPullRequestAttachment({
    organization: plan.organization,
    project: plan.project,
    repository: plan.repository,
    pullRequestId: plan.pullRequestId,
    image,
    token,
    fetchImpl: ctx.fetchImpl,
  });
  const markdown = attachmentMarkdown(attachment.url, plan.alt ?? image.fileName);

  let comment = null;
  if (plan.comment) {
    try {
      comment = await upsertManagedPullRequestComment({
        organization: plan.organization,
        project: plan.project,
        repository: plan.repository,
        pullRequestId: plan.pullRequestId,
        markerKey: image.fileName,
        content: managedCommentContent(markdown, image.fileName),
        token,
        fetchImpl: ctx.fetchImpl,
      });
    } catch {
      const result = {
        ok: false,
        error: 'Attachment is available, but the managed PR comment could not be updated.',
        fileName: attachment.fileName,
        attachmentUrl: attachment.url,
        markdown,
        reused: attachment.reused,
      };
      printResult(result, plan.json);
      return 1;
    }
  }

  printResult({
    ok: true,
    fileName: attachment.fileName,
    attachmentUrl: attachment.url,
    markdown,
    reused: attachment.reused,
    comment,
  }, plan.json);
  return 0;
}
