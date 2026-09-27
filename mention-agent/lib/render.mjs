// Renderers for every workflow `mention-agent` produces.
//
// Three shapes come from the same job body so they cannot drift:
//   renderCaller()     -> the tiny per-repo caller that `uses:` the shared workflow
//   renderStandalone() -> a self-contained workflow for repos that cannot call one
//   renderReusable()   -> the shared `workflow_call` workflow committed at the repo root
//
// No secret value, mention phrase, or account name is embedded here. Everything
// project-specific is a parameter passed in from the user's config or flags.

import {
  AGENT_ACTION,
  AGENT_ACTION_NOTE,
  CHECKOUT_ACTION,
  GENERATED_MARKER,
  TOOL_NAME,
} from './constants.mjs';
import { VERSION } from './package-info.mjs';

const q = (value) => JSON.stringify(String(value));
const yamlBool = (value) => (value ? 'true' : 'false');
const secretRef = (name) => `\${{ secrets.${name} }}`;

/**
 * A GitHub Actions expression string literal. GitHub expressions only accept
 * single-quoted strings (double quotes throw at parse time), and a literal
 * quote is escaped by doubling it.
 */
const exprString = (value) => `'${String(value).replace(/'/g, "''")}'`;

// The cheap pre-checks that must hold before any job starts. Association is
// checked before the mention so outsiders never start a runner, let alone a
// model call; the action still enforces admin/write a second time.
const ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const ASSOCIATIONS_EXPR = exprString(JSON.stringify(ASSOCIATIONS));

function marker() {
  return `${GENERATED_MARKER} v${VERSION} - edit ${'.mention-agent.json'} and run "mention-agent update".`;
}

function onBlock() {
  return [
    'on:',
    '  issue_comment:',
    '    types: [created]',
    '  pull_request_review_comment:',
    '    types: [created]',
  ];
}

/** Serialize concurrent runs of the same issue/PR instead of racing them. */
function concurrencyBlock(indent) {
  const pad = ' '.repeat(indent);
  return [
    `${pad}concurrency:`,
    `${pad}  group: mention-agent-\${{ github.event.issue.number || github.event.pull_request.number }}`,
    `${pad}  cancel-in-progress: false`,
  ];
}

/**
 * Job-level `if:` for the standalone workflow, with the user's values inlined.
 * A missing self-login or allowlist simply drops that clause.
 */
function standaloneGate(config) {
  const parts = [
    'github.event.comment != null',
    `contains(fromJSON(${ASSOCIATIONS_EXPR}), github.event.comment.author_association)`,
    "!endsWith(github.event.comment.user.login, '[bot]')",
    `contains(github.event.comment.body, ${exprString(config.mention)})`,
  ];
  if (config.selfLogin) {
    parts.push(`github.event.comment.user.login != ${exprString(config.selfLogin)}`);
  }
  if (config.allowUsers.length > 0) {
    parts.push(
      `contains(fromJSON(${exprString(JSON.stringify(config.allowUsers))}), github.event.comment.user.login)`,
    );
  }
  return parts.join(' && ');
}

/**
 * Job-level `if:` for the reusable workflow. Hyphenated workflow_call inputs
 * are read with bracket notation, as GitHub expressions require. The allowlist
 * travels as a JSON array so membership is exact (no substring matches) and no
 * `replace`-style string surgery is needed, which GitHub expressions lack.
 */
function reusableGate() {
  return [
    'github.event.comment != null',
    `contains(fromJSON(${ASSOCIATIONS_EXPR}), github.event.comment.author_association)`,
    "!endsWith(github.event.comment.user.login, '[bot]')",
    'contains(github.event.comment.body, inputs.mention)',
    "(inputs['self-login'] == '' || github.event.comment.user.login != inputs['self-login'])",
    "(inputs['allow-users'] == '' || contains(fromJSON(inputs['allow-users']), github.event.comment.user.login))",
  ].join(' && ');
}

/**
 * The job steps, authored once against a binding object so the standalone and
 * reusable variants differ only in where each value comes from.
 *
 * `tokenCheck` controls the fail-fast guard on the token secret: standalone
 * knows the identity at render time, the reusable workflow only at run time.
 */
function agentSteps(bind) {
  const steps = [];
  steps.push(
    '      - name: Verify provider credential',
    '        shell: bash',
    '        env:',
    `          PROVIDER_KEY: ${bind.providerKey}`,
    '        run: |',
    '          if [ -z "$PROVIDER_KEY" ]; then',
    '            echo "provider credential is empty; set the provider secret"',
    '            exit 1',
    '          fi',
  );
  if (bind.tokenCheck.emit) {
    steps.push(
      '      - name: Verify token',
      ...(bind.tokenCheck.if ? [`        if: ${bind.tokenCheck.if}`] : []),
      '        shell: bash',
      '        env:',
      `          TOKEN: ${bind.token}`,
      '        run: |',
      '          if [ -z "$TOKEN" ]; then',
      '            echo "GitHub token is empty; set the token secret"',
      '            exit 1',
      '          fi',
    );
  }
  steps.push(
    '      - name: Export the provider credential',
    '        shell: bash',
    '        env:',
    `          PROVIDER_ENV: ${bind.providerEnv}`,
    `          PROVIDER_KEY: ${bind.providerKey}`,
    '        run: echo "${PROVIDER_ENV}=${PROVIDER_KEY}" >> "$GITHUB_ENV"',
    '',
    '      - name: Check out the repository',
    `        uses: ${CHECKOUT_ACTION}`,
    '        with:',
    '          fetch-depth: 1',
    // Persist credentials in both modes: in pat mode this is what lets the
    // agent push, because the upstream action only configures git auth itself
    // when it is NOT using a caller-provided token. In app mode the action
    // overwrites this header with its installation token.
    '          persist-credentials: true',
    `          token: ${bind.checkoutToken}`,
    '',
    '      - name: Run the mention agent',
    `        uses: ${AGENT_ACTION} # ${AGENT_ACTION_NOTE}`,
    '        env:',
    `          GITHUB_TOKEN: ${bind.token}`,
    '        with:',
    `          model: ${bind.model}`,
    `          agent: ${bind.agent}`,
    `          mentions: ${bind.mention}`,
    `          share: ${bind.share}`,
    `          use_github_token: ${bind.useGithubToken}`,
  );
  return steps;
}

function callerJobPermissions(identity) {
  const lines = ['    permissions:', '      contents: read'];
  // App mode exchanges an OIDC token for an installation token; the caller must
  // grant id-token so the reusable workflow can request it.
  if (identity === 'app') {
    lines.push('      id-token: write');
  }
  return lines;
}

/**
 * The small caller a target repository commits. It only names the shared
 * workflow, the inputs, and the secrets to pass.
 *
 * @param {object} config normalized config
 * @returns {string} YAML
 */
export function renderCaller(config) {
  const allowUsers = config.allowUsers.length > 0 ? JSON.stringify(config.allowUsers) : '';
  const lines = [
    marker(),
    `name: ${TOOL_NAME}`,
    '',
    ...onBlock(),
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
    '  agent:',
  ];
  const uses = `${config.workflow.reusableRepo}/.github/workflows/${TOOL_NAME}.yml@${config.workflow.ref}`;
  lines.push(`    uses: ${q(uses)}`);
  lines.push(...callerJobPermissions(config.identity));
  lines.push('    with:');
  lines.push(`      mention: ${q(config.mention)}`);
  lines.push(`      model: ${q(config.model)}`);
  lines.push(`      agent: ${q(config.agent)}`);
  lines.push(`      share: ${yamlBool(config.share)}`);
  lines.push(`      allow-users: ${q(allowUsers)}`);
  lines.push(`      self-login: ${q(config.selfLogin)}`);
  lines.push(`      provider-env: ${q(config.provider.env)}`);
  lines.push(`      identity: ${q(config.identity)}`);
  lines.push('    secrets:');
  if (config.identity === 'pat') {
    lines.push(`      token: ${secretRef(config.tokenSecret)}`);
  }
  lines.push(`      provider-key: ${secretRef(config.provider.secret)}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * A self-contained workflow for a repository that will not call a shared one.
 * Same gate, same steps; secrets and values are inlined.
 *
 * @param {object} config normalized config
 * @returns {string} YAML
 */
export function renderStandalone(config) {
  const isPat = config.identity === 'pat';
  const bind = {
    providerEnv: q(config.provider.env),
    providerKey: secretRef(config.provider.secret),
    token: secretRef(config.tokenSecret),
    // In app mode the default workflow token is only used for checkout; the
    // action replaces it with its installation token before any push.
    checkoutToken: isPat ? secretRef(config.tokenSecret) : '${{ github.token }}',
    tokenCheck: isPat ? { emit: true, if: null } : { emit: false },
    model: q(config.model),
    agent: q(config.agent),
    mention: q(config.mention),
    share: yamlBool(config.share),
    useGithubToken: isPat ? 'true' : 'false',
  };
  const lines = [
    marker(),
    `name: ${TOOL_NAME}`,
    '',
    ...onBlock(),
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
    '  agent:',
    '    if: >',
    `      ${standaloneGate(config)}`,
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 30',
    ...concurrencyBlock(4),
    ...callerJobPermissions(config.identity),
    '    steps:',
    ...agentSteps(bind),
    '',
  ];
  return lines.join('\n');
}

/**
 * The shared `workflow_call` workflow committed at the hosting repo root. Target
 * repositories reference this by tag, so every repo updates from one file.
 *
 * @returns {string} YAML
 */
export function renderReusable() {
  const bind = {
    providerEnv: '${{ inputs.provider-env }}',
    providerKey: '${{ secrets.provider-key }}',
    token: '${{ secrets.token }}',
    checkoutToken: "${{ inputs.identity == 'pat' && secrets.token || github.token }}",
    tokenCheck: { emit: true, if: "inputs.identity == 'pat'" },
    model: '${{ inputs.model }}',
    agent: '${{ inputs.agent }}',
    mention: '${{ inputs.mention }}',
    share: '${{ inputs.share }}',
    useGithubToken: "${{ inputs.identity == 'pat' }}",
  };
  return [
    `${GENERATED_MARKER} v${VERSION} - run "npm run sync-reusable" in mention-agent/ after editing lib/render.mjs.`,
    'name: mention-agent (reusable)',
    '',
    'on:',
    '  workflow_call:',
    '    inputs:',
    '      mention:',
    '        description: "Trigger phrase to match in a comment, for example \\"@example-bot\\"."',
    '        type: string',
    '        required: true',
    '      model:',
    '        description: "Model in provider/model form, for example opencode-go/deepseek-v4.1-flash."',
    '        type: string',
    '        required: true',
    '      provider-env:',
    '        description: "Environment variable the provider credential is exported as, for example OPENCODE_API_KEY."',
    '        type: string',
    '        required: true',
    '      agent:',
    '        description: "Primary agent to run."',
    '        type: string',
    '        default: build',
    '      identity:',
    '        description: "pat to act as the token user, or app to use the agent GitHub App."',
    '        type: string',
    '        default: pat',
    '      share:',
    '        description: "Publish the agent session to the provider share page."',
    '        type: boolean',
    '        default: false',
    '      self-login:',
    '        description: "Login to ignore so the agent never answers itself."',
    '        type: string',
    '        default: ""',
    '      allow-users:',
    '        description: "JSON array of logins allowed to trigger a run, for example [\\"alice\\",\\"bob\\"]. Empty means any user with write access."',
    '        type: string',
    '        default: ""',
    '    secrets:',
    '      token:',
    '        description: "GitHub token used to comment and push. Required when identity is pat."',
    '        required: false',
    '      provider-key:',
    '        description: "Provider credential for the model."',
    '        required: true',
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
    '  agent:',
    '    if: >',
    `      ${reusableGate()}`,
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 30',
    ...concurrencyBlock(4),
    '    permissions:',
    '      contents: read',
    '      id-token: write',
    '    steps:',
    ...agentSteps(bind),
    '',
  ].join('\n');
}
