// Config load/merge/validate for `.mention-agent.json`.
//
// Precedence: built-in defaults < provider registry < existing config file <
// explicit CLI flags. Nothing here is account-specific; the hosting repository
// is resolved from package metadata and every secret name is user-controlled.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONFIG_FILE,
  DEFAULT_AGENT,
  DEFAULT_TOKEN_SECRET,
  TOOL_NAME,
  VERSION_REF,
  WORKFLOW_DIR,
  WORKFLOW_FILE,
} from './constants.mjs';
import { DEFAULT_PROVIDER, getProvider, PROVIDERS } from './providers.mjs';
import { REPOSITORY } from './package-info.mjs';

export class ConfigError extends Error {}

const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SECRET_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Built-in defaults for a fresh install, before any config file or flags. */
export function defaultConfig({ provider = DEFAULT_PROVIDER, reusableRepo = REPOSITORY } = {}) {
  const spec = getProvider(provider) ?? PROVIDERS[DEFAULT_PROVIDER];
  return {
    mention: '',
    model: spec.model,
    agent: DEFAULT_AGENT,
    identity: 'pat',
    selfLogin: '',
    allowUsers: [],
    share: false,
    provider: { env: spec.env, secret: spec.secret },
    tokenSecret: DEFAULT_TOKEN_SECRET,
    workflow: {
      path: `${WORKFLOW_DIR}/${WORKFLOW_FILE}`,
      reusableRepo,
      ref: VERSION_REF,
    },
    standalone: false,
  };
}

/** Read `.mention-agent.json` from a directory, or null when it is absent. */
export function readConfig(dir) {
  const file = join(dir, CONFIG_FILE);
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError(`${CONFIG_FILE} must contain a JSON object`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`${CONFIG_FILE} is not valid JSON: ${error.message}`);
  }
}

/**
 * Merge a stored config and explicit flags into a complete, normalized config.
 *
 * @param {object} args
 * @param {object|null} [args.existing] config read from disk
 * @param {object} [args.flags] values parsed from the CLI
 * @param {string} [args.reusableRepo] owner/repo hosting the shared workflow
 * @returns {object} normalized config
 */
export function buildConfig({ existing = null, flags = {}, reusableRepo = REPOSITORY } = {}) {
  const providerName =
    typeof flags.provider === 'string' && flags.provider.length > 0 ? flags.provider : DEFAULT_PROVIDER;
  const base = defaultConfig({ provider: providerName, reusableRepo });
  const chosen = flags.provider ? getProvider(flags.provider) : null;

  const merged = {
    ...base,
    ...(existing ?? {}),
    provider: { ...base.provider, ...(existing?.provider ?? {}) },
    workflow: { ...base.workflow, ...(existing?.workflow ?? {}) },
  };

  if (flags.mention !== undefined) merged.mention = flags.mention;
  if (flags.model !== undefined) merged.model = flags.model;
  if (flags.agent !== undefined) merged.agent = flags.agent;
  if (flags.identity !== undefined) merged.identity = flags.identity;
  if (flags.selfLogin !== undefined) merged.selfLogin = flags.selfLogin;
  if (flags.allowUsers !== undefined) merged.allowUsers = flags.allowUsers;
  if (flags.share !== undefined) merged.share = flags.share;
  if (flags.tokenSecret !== undefined) merged.tokenSecret = flags.tokenSecret;
  if (flags.providerEnv !== undefined) merged.provider.env = flags.providerEnv;
  if (flags.providerSecret !== undefined) merged.provider.secret = flags.providerSecret;
  if (flags.ref !== undefined) merged.workflow.ref = flags.ref;
  if (flags.reusableRepo !== undefined) merged.workflow.reusableRepo = flags.reusableRepo;
  if (flags.standalone !== undefined) merged.standalone = flags.standalone;

  // Switching provider on a fresh setup also switches the default env/secret/model.
  if (chosen && existing === null) {
    if (flags.providerEnv === undefined) merged.provider.env = chosen.env;
    if (flags.providerSecret === undefined) merged.provider.secret = chosen.secret;
    if (flags.model === undefined) merged.model = chosen.model;
  }

  if (!merged.selfLogin && merged.mention) {
    merged.selfLogin = String(merged.mention).replace(/^@/, '');
  }
  if (!merged.workflow.reusableRepo) {
    merged.workflow.reusableRepo = reusableRepo;
  }
  if (!Array.isArray(merged.allowUsers)) {
    merged.allowUsers = merged.allowUsers ? [String(merged.allowUsers)] : [];
  }
  merged.allowUsers = merged.allowUsers.map((entry) => String(entry).trim()).filter(Boolean);
  merged.share = merged.share === true;

  return merged;
}

/** Validate a normalized config; returns an array of human-readable errors. */
export function validateConfig(config) {
  const errors = [];
  if (!config.mention || typeof config.mention !== 'string') {
    errors.push('mention is required (the phrase to look for, e.g. "@example-bot")');
  }
  if (!['pat', 'app'].includes(config.identity)) {
    errors.push('identity must be "pat" or "app"');
  }
  if (typeof config.model !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(config.model)) {
    errors.push('model must be in provider/model form, e.g. opencode-go/deepseek-v4.1-flash');
  }
  if (!config.agent || typeof config.agent !== 'string') {
    errors.push('agent is required');
  }
  if (!ENV_RE.test(config.provider?.env ?? '')) {
    errors.push('provider env must be a valid environment variable name, e.g. OPENCODE_API_KEY');
  }
  if (!SECRET_RE.test(config.provider?.secret ?? '')) {
    errors.push('provider secret must be a valid secret name, e.g. OPENCODE_API_KEY');
  }
  if (config.identity === 'pat' && !SECRET_RE.test(config.tokenSecret ?? '')) {
    errors.push('token secret must be a valid secret name, e.g. MENTION_AGENT_TOKEN');
  }
  for (const key of [config.provider?.secret, config.tokenSecret]) {
    if (typeof key === 'string' && key.startsWith('GITHUB_')) {
      errors.push(`secret name "${key}" is reserved: GitHub rejects secret names starting with GITHUB_`);
    }
  }
  if (!Array.isArray(config.allowUsers)) {
    errors.push('allowUsers must be a list of logins');
  } else {
    for (const login of config.allowUsers) {
      if (!LOGIN_RE.test(login)) errors.push(`allowUsers entry "${login}" is not a valid GitHub login`);
    }
  }
  if (config.selfLogin && !LOGIN_RE.test(config.selfLogin)) {
    errors.push(`selfLogin "${config.selfLogin}" is not a valid GitHub login`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(config.workflow?.reusableRepo ?? '')) {
    errors.push('workflow.reusableRepo must be owner/repo hosting the shared workflow');
  }
  if (!config.workflow?.ref) {
    errors.push('workflow.ref is required, e.g. mention-agent-v1');
  }
  if (!config.workflow?.path) {
    errors.push('workflow.path is required');
  }
  return errors;
}

/** Serialize a config for `.mention-agent.json`. */
export function serializeConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export const CONFIG_FILENAME = CONFIG_FILE;
export const TOOL = TOOL_NAME;
