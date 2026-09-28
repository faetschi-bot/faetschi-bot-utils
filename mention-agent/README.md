# mention-agent

Let a GitHub comment mention run an AI coding agent in your repository. Mention
your bot in an issue or pull request — `@example-bot review this PR` — and the
agent reads the thread, reviews the change, and answers in a comment. With
`--allow-writes` it can also commit the change to the same pull request; by
default it is **comment-only**.

`mention-agent` is an installer. It writes a small caller workflow plus a config
file into a repository; the workflow itself is maintained **once** in
[`faetschi-bot-utils`](https://github.com/faetschi-bot/faetschi-bot-utils) as a
[reusable workflow](https://docs.github.com/actions/using-workflows/reusing-workflows),
so there is nothing large to copy and updates land in one place.

The agent runs on GitHub's runners using the
[OpenCode GitHub action](https://opencode.ai/docs/github/) under the hood. It
only runs when someone is mentioned, so an idle repository costs nothing.

## Requirements

- **Node 20+** to run `mention-agent`.
- A GitHub repository with **Actions enabled**.
- A **GitHub token** to comment and push (identity mode `pat`), stored as a
  repository secret. A fine-grained token needs Contents, Issues, and Pull
  requests read/write; a classic token needs the `repo` scope.
- A **provider credential** for the model, stored as a repository secret.
- `gh` (optional) — `mention-agent doctor` uses it for the remote checks.

## Install

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/mention-agent-latest/mention-agent.tgz
npx mention-agent --help
```

Or vendor it / add the monorepo as a submodule:

```bash
cp -r mention-agent /path/to/project/tools/mention-agent
node tools/mention-agent/bin/mention-agent.mjs setup --mention @example-bot

git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
node tools/faetschi-bot-utils/mention-agent/bin/mention-agent.mjs setup --mention @example-bot
```

## Quick start

Run this inside the repository that should answer mentions:

```bash
npx mention-agent setup \
  --mention @example-bot \
  --allow-users your-github-login \
  --token-secret EXAMPLE_BOT_TOKEN
```

The defaults are chosen to be safe: the agent is **comment-only** (it cannot push
code), a **trigger allowlist is required**, and each run injects a **restricted
agent** that has no shell, no web access, and cannot read `.env` files. Add
`--allow-writes` only if you want the agent to commit, and pair it with
`--write-environment` to require an approval.

### TL;DR

Install it in a repository:

```bash
npx mention-agent setup \
  --mention @your-bot \
  --allow-users alice,bob
```

Only `alice` and `bob` can trigger it. A user must also be a repository
`OWNER`, `MEMBER`, or `COLLABORATOR` with GitHub write/admin access. Bots and the
configured bot account are ignored.

When an allowed user comments:

```text
@your-bot review this PR
```

the agent reads the repository and PR/issue context, uses the configured AI
provider, and posts or updates a GitHub comment. By default it can use `read`,
`grep`, and `glob`, but **cannot** edit files, commit, push, run shell commands,
access web search/URLs, launch subagents, use MCP tools, or read `.env` files or
environment variables.

To enable changes and verification commands:

```bash
npx mention-agent setup \
  --mention @your-bot \
  --allow-users alice,bob \
  --allow-writes \
  --write-environment mention-agent-writes
```

Write mode allows the agent to edit files, run curated test/build/lint/package
commands, and commit or push to a PR branch. Environment-gated writes require
GitHub Environment approval before credentials are available.

The allowlist contains actual GitHub login names, not display names or comment
text. To change it, update `.mention-agent.json` and run `npx mention-agent update`.

### Secure setup checklist

Do these before the first mention. `setup` prints the same list, tailored to
your config:

1. **Scope the token.** For a `pat` install, create the token secret from a
   **dedicated account** as a **fine-grained token scoped to this repository**:
   - comment-only (default): `Contents: read`, `Issues: write`, `Pull requests: write`
   - with `--allow-writes`: also `Contents: write`
2. **Limit the provider key.** Use a provider key with only the access the agent
   needs; store it as the provider secret.
3. **Keep the allowlist short.** Only the logins in `--allow-users` can trigger a
   run; `doctor` fails without one.
4. **Treat input as untrusted.** The agent reads issue and PR text; write mode
   may run branch tooling. Do not mention it on fork PRs you do not trust.
5. **Keep the restricted agent on** (default). It denies `shell`, `webfetch`,
   `websearch`, subagents, and `.env` reads, and denies edits unless writes are
   enabled. Write mode also permits only the curated test/build/lint commands so
   the agent can verify its edits; those commands execute repository code.
   `--no-restrict-agent` turns the restriction off.
6. **Stay comment-only** unless you need commits; with writes on, review every
   commit before merging.
7. **Gate writes behind an environment.** With `--write-environment <name>`,
   create that environment with **required reviewers**, **prevent self-review**,
   deployment branches limited to the default branch, and put the token (and
   provider key) there as **environment secrets** — writes then need an approval
   and the secrets are not readable by every repository writer.
8. **Keep `share` off** (the default) so the agent session is not published.

### What the agent can and cannot do

| Capability | Comment-only (default) | Writes (`--allow-writes`) | Writes + `--write-environment` |
|---|---|---|---|
| Read files, `grep`, `glob` | ✅ | ✅ | ✅ |
| Post or replace a comment | ✅ (by the action) | ✅ (by the action) | ✅ (by the action) |
| Run shell commands | ❌ | ✅ Curated test/build/lint commands only | ✅ After environment approval; curated commands only |
| Fetch URLs / web search | ❌ | ❌ | ❌ |
| Read `.env` files or environment variables | ❌ | ❌ | ❌ |
| Launch subagents / MCP tools | ❌ | ❌ | ❌ |
| Edit files | ❌ | ✅ | ✅ After approval |
| Commit / push | ❌ | ✅ The action does it | ✅ The action does it after approval |
| Push directly to the default branch | ❌ | ❌ | ❌ |

Write-mode shell commands are intentionally limited to common test, build,
format, lint, and git-inspection commands. This is not a sandbox: a repository's
test or build script can execute arbitrary code, so treat `--allow-writes` as a
higher-risk mode and review the resulting commits.

Then:

1. Add the repository secrets it names (Settings → Secrets and variables →
   Actions):
   - `EXAMPLE_BOT_TOKEN` — the GitHub token the agent acts as.
   - `OPENCODE_API_KEY` — the provider credential for the model.
2. Run the check and require `"ok": true`:

   ```bash
   npx mention-agent doctor --json
   ```
3. Commit `.mention-agent.json` and `.github/workflows/mention-agent.yml`.

Now, on any issue or pull request:

- `@example-bot review this PR` — the whole comment becomes the instruction.
- `@example-bot` on its own — a default summary/review of the thread or the
  commented lines.

The agent leaves a 👀 reaction while it works and replies in a comment. With
`--allow-writes`, when a requested change modifies files it commits to the pull
request's branch (or opens a pull request when the mention is on an issue).

## What `setup` writes

- **`.mention-agent.json`** — the single source of truth. `update` re-renders the
  workflow from it, and `doctor` verifies the two agree.
- **`.github/workflows/mention-agent.yml`** — a small caller that `uses:` the
  shared reusable workflow by an exact release tag.

`setup` never overwrites an existing file without `--force`. `update` always
re-renders. Both support `--dry-run`.

## Configuration

| Field | Flag | Notes |
|-------|------|-------|
| `mention` | `--mention` | Required. The phrase to look for, e.g. `@example-bot`. |
| `model` | `--model` | `provider/model`, e.g. `opencode-go/deepseek-v4.1-flash`. |
| `agent` | `--agent` | Primary agent to run (default `build`). |
| `identity` | `--identity` | `pat` (act as the token's user, default) or `app`. |
| `selfLogin` | `--self-login` | Login to ignore so the agent never answers itself. Defaults to `mention` without the leading `@`. |
| `allowUsers` | `--allow-users` | Comma-separated logins allowed to trigger a run. Empty means any user with write access. |
| `share` | `--share` / `--no-share` | Publish the agent session to the provider share page. Off by default. |
| `allowWrites` | `--allow-writes` | Let the agent commit and push. Off by default (comment-only). |
| `restrictAgent` | `--no-restrict-agent` | Inject a restricted agent (no web, `.env` reads, or unrestricted shell). On by default. Write mode permits curated verification commands. |
| `writeEnvironment` | `--write-environment` | Gate writes behind a GitHub environment (required reviewers + environment secrets). Requires `--allow-writes`. |
| `provider.env` | `--provider-env` | Environment variable the credential is exported as. |
| `provider.secret` | `--provider-secret` | Repository secret holding the credential. |
| `tokenSecret` | `--token-secret` | Repository secret holding the GitHub token (`pat`). |
| `workflow.ref` | `--ref` | Exact immutable release tag, e.g. `mention-agent-v0.1.0`. Moving refs are rejected. |
| `workflow.reusableRepo` | `--reusable-repo` | Repository hosting the shared workflow. |
| `standalone` | `--standalone` | Render a self-contained workflow instead of calling the shared one. |

### Providers

`--provider` picks sensible `env`/`secret`/`model` defaults:

| Provider | Environment variable | Default model |
|----------|----------------------|---------------|
| `opencode` (default) | `OPENCODE_API_KEY` | `opencode-go/deepseek-v4.1-flash` |
| `openai` | `OPENAI_API_KEY` | `openai/gpt-5.6-sol` |
| `anthropic` | `ANTHROPIC_API_KEY` | `anthropic/claude-sonnet-4-5` |

Any provider the OpenCode action supports works: pass `--provider-env` and
`--model` for one that is not listed. The reusable workflow exports whatever
`provider-env` names, so no provider is hardcoded in it. Adding a preset is a
one-line entry in `lib/providers.mjs`. Supporting several providers in one
install at once is a planned extension; the registry and the generic
`provider-env` are shaped for it.

## Access control

Three gates apply before any agent run, cheapest first:

1. **Association** — the commenter must be an `OWNER`, `MEMBER`, or
   `COLLABORATOR` of the repository, checked in the job condition so an outsider
   never starts a runner.
2. The **allowlist** (`allowUsers`) — only those logins can trigger a run.
   Everyone else is ignored, so a stray comment cannot spend tokens. `setup`
   refuses to run without one (pass `--allow-any-writer` to opt out) and `doctor`
   treats an **empty allowlist as an error**: name who may spend tokens.
3. The action's **built-in check** — the commenter must have `admin` or `write`
   access. Bots (`*[bot]`) and the configured `self-login` are always ignored.

## Security notes

- Run the **Secure setup checklist** above first; the safe defaults are enforced
  by the generated workflow and re-checked by `doctor`.
- **Comment-only by default.** The workflow does not persist git credentials, so
  a `pat`-mode agent structurally cannot push. `--allow-writes` enables commits,
  and then the token needs `Contents: write`.
- **Restricted agent by default.** Each run injects a config that makes the
  agent unable to fetch URLs, launch subagents, or read `.env` files. It cannot
  edit or run shell commands in comment-only mode. Write mode permits only the
  curated test/build/lint commands so it can verify edits; those commands run
  repository code and therefore weaken the execution boundary.
- **Environment-gated writes.** With `--write-environment`, the write path is a
  self-contained workflow whose job references that environment, because GitHub
  cannot pass environment secrets through a reusable workflow. The token then
  lives as an environment secret and the job waits for its approval rules.
- `share` is off by default, so the agent session is not published.
- The caller requests only `contents: read`; the ability to comment (and, with
  writes, push) comes from the token you pass, not the default `GITHUB_TOKEN`.
- The token you provide to a `pat` install has whatever access its owner has.
  Prefer a **dedicated account** with a **fine-grained token** scoped to the one
  repository and only Contents/Issues/Pull requests write.
- **Prompt injection is inherent.** The agent reads untrusted issue and PR text.
  In write mode it may run curated branch tooling with the token and provider
  key in its environment. Only an allowlisted, write-access user can start a
  run, but treat fork PRs and untrusted contributors as untrusted input
  regardless. There is no sandbox around the runner's network.
- **Fork pull requests:** pushing back to a fork usually fails, because the token
  generally has no write access to someone else's fork. Commenting still works.
- **Supply chain:** the generated workflow pins both the third-party OpenCode
  action and `actions/checkout` to reviewed commit SHAs. New installs pin the
  shared reusable workflow to an exact `mention-agent-vX.Y.Z` release tag; update
  deliberately when reviewing a new release. Require full-length SHA pins in
  the repository or organization Actions policy.
- **Workflow review:** add a `CODEOWNERS` entry for `/.github/workflows/` owned by
  a trusted user or team. Workflow edits are equivalent to secret-access edits.
- **Default token:** set the repository's Actions workflow permission to
  **read repository contents** in Settings → Actions → General. The generated
  workflow requests only read permission from the default `GITHUB_TOKEN`.
- **Repository scanning:** enable GitHub code scanning and secret scanning in
  repository or organization security settings. The CLI cannot safely enable
  those settings because they are controlled by repository administrators.
- Runs are bounded by `timeout-minutes: 30` and serialized per issue/PR with a
  `concurrency` group so repeated mentions do not race pushes or duplicate spend.

## Going further

Documented so you can pick them up later:

- **Short-lived identity.** `--identity app` uses GitHub App installation tokens
  (about an hour) instead of a long-lived PAT. Trade-off: comments come from the
  app bot, not your account.
- **Provider budget.** Use a project-scoped provider key with a spend limit.
- **Run it on your own box.** Dispatch from a workflow to your hardened
  OpenChamber container over Tailscale instead of running on GitHub's runner: no
  secrets in GitHub, controlled egress, your sandbox. Highest security, highest
  complexity.

## Verify an install

```bash
npx mention-agent doctor --json
```

It checks the repository, the config, the workflow (including drift against the
config), the allowlist and self-login warnings, and — with `gh` — that the named
secrets exist and Actions is enabled. When `gh` is unavailable or `--no-remote`
is passed, the remote checks are reported as `skipped` rather than assumed to
pass. Exit code is 0 when no error-level check fails, 1 otherwise.

## Maintaining / releasing

The shared reusable workflow is generated:

```bash
cd mention-agent
npm run sync-reusable      # regenerate .github/workflows/mention-agent.yml
npm test                   # includes a drift test
```

Do not tag by hand. Bump `version` in `mention-agent/package.json`, merge to
`main`; the release workflow publishes the tarball and keeps the legacy
`mention-agent-v1` compatibility ref updated. New installs use the exact
version tag and must be deliberately updated for a new release.
