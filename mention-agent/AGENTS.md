# mention-agent — agent guide

Install a GitHub Actions agent that answers `@mentions` by running an AI coding
agent in a repository. This file is the canonical recipe; prefer it and
`mention-agent --help` over reading the source.

## What an agent needs

| Capability | Why |
|------------|-----|
| Write access to the **target** project | To write `.mention-agent.json` and the workflow. |
| Node 20+ | To run `mention-agent`. |
| A GitHub token to store as a secret | The agent acts as it (identity `pat`) to comment and push. |
| A provider credential to store as a secret | To run the model. |
| `gh` (optional) | `doctor` uses it for the remote checks. |

## Bootstrap (pick one)

```bash
# A. Release tarball (recommended)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/mention-agent-latest/mention-agent.tgz

# B. Vendored copy
cp -r mention-agent /path/to/project/tools/mention-agent

# C. Git submodule (one copy shared across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

Run it from the target repository (`npx mention-agent …`, or
`node tools/mention-agent/bin/mention-agent.mjs …`). It resolves the git root.

## Install into a project

```bash
npx mention-agent setup \
  --mention @example-bot \
  --allow-users <comma-separated logins> \
  --token-secret <GITHUB_TOKEN_SECRET_NAME>
```

This writes `.mention-agent.json` and `.github/workflows/mention-agent.yml`
(a caller for the shared reusable workflow). It never overwrites existing files
without `--force`. Then add the repository secrets it names and commit both
files:

```bash
npx mention-agent doctor --json      # require "ok": true
git add .mention-agent.json .github/workflows/mention-agent.yml
git commit -m "chore: add mention-agent"
```

Do not edit the generated workflow by hand. Change `.mention-agent.json` (or pass
flags) and run `mention-agent update`.

## Verify before reporting success

```bash
npx mention-agent doctor --json
```

Require `"ok": true`. With `gh` unavailable or `--no-remote`, remote checks are
reported as `skipped`; say so instead of claiming full verification.

## Commands

| Command | Purpose |
|---------|---------|
| `setup` | Write the config and workflow. `--force`, `--dry-run`. |
| `update` | Re-render the workflow from the stored config. |
| `doctor` | Validate the install. `--json`, `--no-remote`. |
| `print` | Print the workflow to stdout (`--standalone` for a self-contained one). |

Key flags: `--mention` (required), `--model`, `--agent`, `--identity pat|app`,
`--provider`, `--provider-env`, `--provider-secret`, `--token-secret`,
`--self-login`, `--allow-users`, `--ref`, `--reusable-repo`, `--standalone`,
`--share`/`--no-share`.

## How it behaves

- The agent runs only when the mention phrase appears in a comment. `@bot review
  this PR` passes the comment as the instruction; a bare `@bot` produces a
  default summary/review.
- It comments the result, and commits to the same pull request only when the
  requested work changes files (or opens a pull request when mentioned on an
  issue).
- Only logins in `allowUsers` (when set) that also have `admin`/`write` on the
  repository can trigger a run. `*[bot]` and `self-login` are ignored.

## Security rules

- Never hardcode a mention phrase, account name, or secret; they live in the
  config or flags.
- Keep `share` off unless the user asks otherwise.
- Point `--token-secret` at a dedicated token with the least access that works.

## Releasing (maintainers)

The reusable workflow is generated from `lib/render.mjs`:

```bash
cd mention-agent
npm run sync-reusable      # regenerate .github/workflows/mention-agent.yml
npm test                   # includes a drift test
```

Do not tag by hand. Bump `version` in `mention-agent/package.json`, merge to
`main`; the release workflow publishes the tarball and moves the
`mention-agent-v1` ref.
