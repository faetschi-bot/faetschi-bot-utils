# mention-agent

Let a GitHub comment mention run an AI coding agent in your repository. Mention
your bot in an issue or pull request — `@example-bot review this PR` — and the
agent reads the thread, reviews the change, and answers in a comment. When the
task asks for code, it commits the change to the same pull request instead.

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

The agent leaves a 👀 reaction while it works, replies in a comment, and, when a
requested change modifies files, commits to the pull request's branch (or opens a
pull request when the mention is on an issue).

## What `setup` writes

- **`.mention-agent.json`** — the single source of truth. `update` re-renders the
  workflow from it, and `doctor` verifies the two agree.
- **`.github/workflows/mention-agent.yml`** — a small caller that `uses:` the
  shared reusable workflow by tag.

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
| `provider.env` | `--provider-env` | Environment variable the credential is exported as. |
| `provider.secret` | `--provider-secret` | Repository secret holding the credential. |
| `tokenSecret` | `--token-secret` | Repository secret holding the GitHub token (`pat`). |
| `workflow.ref` | `--ref` | Shared workflow ref (default `mention-agent-v1`). |
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
   Everyone else is ignored, so a stray comment cannot spend tokens. `doctor`
   treats an **empty allowlist as an error**: name who may spend tokens.
3. The action's **built-in check** — the commenter must have `admin` or `write`
   access. Bots (`*[bot]`) and the configured `self-login` are always ignored.

## Security notes

- `share` is off by default, so the agent session is not published.
- The caller requests only `contents: read`; the ability to comment and push
  comes from the token you pass, not the default `GITHUB_TOKEN`.
- The token you provide to a `pat` install has whatever access its owner has.
  Prefer a **dedicated account** with a **fine-grained token** scoped to the one
  repository and only Contents/Issues/Pull requests write.
- **Prompt injection is inherent.** The agent reads untrusted issue and PR text,
  and for a PR it checks out the branch, so it may run that code with the token
  and provider key in its environment. Only an allowlisted, write-access user
  can start a run, but treat fork PRs and untrusted contributors as untrusted
  input regardless. There is no sandbox around the runner's network.
- **Fork pull requests:** pushing back to a fork usually fails, because the token
  generally has no write access to someone else's fork. Commenting still works.
- **Supply chain:** the job runs the third-party action
  `anomalyco/opencode/github` pinned to a reviewed commit, which itself installs
  the latest `opencode` at run time. The shared reusable workflow is referenced
  by the moving `mention-agent-v1` tag, which this repository force-moves on
  merge; a compromise of the hosting repository would reach every consumer.
  Pin `--ref` to an exact `mention-agent-vX.Y.Z` tag if you want to review each
  update.
- Runs are bounded by `timeout-minutes: 30` and serialized per issue/PR with a
  `concurrency` group so repeated mentions do not race pushes or duplicate spend.

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
`main`; the release workflow publishes the tarball and moves the
`mention-agent-v1` ref so installed callers pick up the change.
