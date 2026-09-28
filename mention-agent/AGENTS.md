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
without `--force`. The defaults are safe: the agent is **comment-only** and an
**allowlist is required**. Add `--allow-writes` only if it must commit, and pass
`--allow-any-writer` only if you deliberately want any write-access user able to
trigger runs. Then add the repository secrets it names and commit both files:

```bash
npx mention-agent doctor --json      # require "ok": true
git add .mention-agent.json .github/workflows/mention-agent.yml
git commit -m "chore: add mention-agent"
```

## Security checklist (run this at setup)

`setup` prints this list; follow it before the first mention:

1. For a `pat` install, create the token secret from a **dedicated account** as
   a **fine-grained token scoped to this one repository**:
   - comment-only (default): `Contents: read`, `Issues: write`, `Pull requests: write`
   - with `--allow-writes`: also `Contents: write`
2. Store the provider key as a secret with only the access the agent needs.
3. Keep `--allow-users` short; `doctor` fails without an allowlist.
4. Never mention the agent on fork PRs you do not trust — it reads untrusted
   text and may run branch code.
5. Keep the restricted agent on (the default): it denies web, subagents, and
   `.env` reads; comment-only mode also denies shell and edits. Write mode allows
   only curated test/build/lint commands so the agent can verify edits. Those
   commands execute repository code. `--no-restrict-agent` opts out.
6. Prefer comment-only; for commits use `--allow-writes`, and gate them with
   `--write-environment <name>` — create that environment with required
   reviewers, "prevent self-review", default-branch-only deployment, and the
   token (and provider key) as environment secrets.
7. Keep `share` off (default).

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
`--self-login`, `--allow-users` (required unless `--allow-any-writer`),
`--allow-writes`, `--write-environment`, `--no-restrict-agent`, `--ref`,
`--reusable-repo`, `--standalone`, `--share`/`--no-share`.

## How it behaves

- The agent runs only when the mention phrase appears in a comment. `@bot review
  this PR` passes the comment as the instruction; a bare `@bot` produces a
  default summary/review.
- It is **comment-only by default** and cannot push. With `--allow-writes` it
  commits to the same pull request when the requested work changes files (or
  opens a pull request when mentioned on an issue).
- Every run injects a **restricted agent** (no web, subagents, or `.env` reads;
  no shell or edits in comment-only mode). Write mode permits only curated
  test/build/lint commands and edits, so it can verify its own changes but runs
  repository code.
- Only logins in `allowUsers` (required; `doctor` errors when empty) that are
  also repository `OWNER`/`MEMBER`/`COLLABORATOR`s with `admin`/`write` can
  trigger a run. `*[bot]` and `self-login` are ignored.

## Security rules

- Follow the **Security checklist** above at setup; `setup` prints it.
- Never hardcode a mention phrase, account name, or secret; they live in the
  config or flags.
- Keep `share` off and writes off unless the user asks otherwise.
- Point `--token-secret` at a **dedicated, fine-grained token** limited to the
  one repository; add `Contents: write` only with `--allow-writes`.
- Treat issue and PR text as untrusted: write mode can run curated branch tools
  with the token and provider key in the runner environment. Set
  `--allow-users` and do not loosen it for unreviewed accounts.

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
