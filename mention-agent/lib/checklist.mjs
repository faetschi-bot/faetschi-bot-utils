// The secure-setup checklist.
//
// Safe defaults are enforced by config + render (comment-only, required
// allowlist, restricted agent, share off). This is the human/agent action list
// the generated files cannot do for themselves — above all, token scopes and
// the environment that gates writes.

/**
 * @param {object} config normalized config
 * @returns {string[]} ordered checklist items
 */
export function securityChecklist(config) {
  const items = [];
  const scope = config.allowWrites
    ? 'Contents: read and write, plus Issues: write and Pull requests: write'
    : 'Contents: read, plus Issues: write and Pull requests: write (comment-only, no code push)';

  if (config.identity === 'pat') {
    items.push(
      `Create secret ${config.tokenSecret} from a dedicated account as a fine-grained token scoped to THIS repository, with ${scope}.`,
    );
  } else {
    items.push(
      'Install the agent GitHub App on this repository and grant it only the permissions the work needs (identity: app).',
    );
  }
  items.push(`Create secret ${config.provider.secret} with a provider key limited to what the agent needs.`);
  items.push(
    config.allowUsers.length > 0
      ? `Runs are limited to: ${config.allowUsers.join(', ')}. Keep this list short.`
      : 'Name an allowlist so only named people can trigger runs (doctor fails without one).',
  );
  items.push('Fork pull requests are rejected by the workflow; still treat issue and PR text as untrusted input.');
  items.push(
    config.restrictAgent
      ? 'The run injects a restricted agent: no shell, no web, no subagents, no .env reads. Only file edits are enabled, and only with --allow-writes.'
      : 'The restricted agent is off: the agent can run shell commands and fetch URLs. Re-enable it unless you need those tools.',
  );
  items.push(
    config.allowWrites
      ? 'Writes are enabled: review every commit the agent pushes before merging.'
      : 'Comment-only: the agent cannot push code. Add --allow-writes only if you need it.',
  );
  if (config.allowWrites && config.writeEnvironment) {
    items.push(
      `Create environment "${config.writeEnvironment}" with required reviewers (and "prevent self-review"), limit deployment branches to the default branch, and add ${config.tokenSecret} (and ${config.provider.secret}) as environment secrets so writes need an approval.`,
    );
  } else if (config.allowWrites) {
    items.push(
      'Writes are not environment-gated: consider --write-environment to require an approval and scope the write token.',
    );
  }
  items.push(
    `The shared workflow is pinned to an exact release tag (${config.workflow.ref}); keep the generated checkout and agent actions pinned to reviewed commit SHAs.`,
  );
  items.push(
    'Require full-length SHA-pinned Actions in repository/org policy, add a CODEOWNERS rule for /.github/workflows/, and enable code scanning and secret scanning in GitHub security settings.',
  );
  items.push('Keep share off so the agent session is not published (default).');
  return items;
}
