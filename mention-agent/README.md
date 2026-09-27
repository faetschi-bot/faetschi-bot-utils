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
`provider-env` names, so no provider is hardcoded in it.

## Access control

Two gates apply before any agent run:

1. The **allowlist** (`allowUsers`). When set, only those logins can trigger a
   run; everyone else is ignored, so a stray comment cannot spend tokens.
2. The action's **built-in check**: the commenter must have `admin` or `write`
   access to the repository. Bots (`*[bot]`) and the configured `self-login` are
   always ignored.

## Security notes

- `share` is off by default, so the agent session is not published.
- The caller requests only `contents: read`; the ability to comment and push
  comes from the token you pass, not the default `GITHUB_TOKEN`.
- The token you provide to a `pat` install has whatever access its owner has.
  Prefer a dedicated account with access only to the repositories you need.
- The agent runs on GitHub's runners. Only collaborators with write access (and,
  when configured, the allowlist) can start a run.

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
