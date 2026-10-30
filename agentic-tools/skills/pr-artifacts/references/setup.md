# Project setup

Four files make the artifact contract real, once per repository. The skill
supplies the recipes; these files supply the enforcement.

For Azure Repos, follow [Azure DevOps publishing](./azure-devops.md) first.
The contract and local body checker below apply to both providers. Store an
Azure Repos PR template at `.azuredevops/pull_request_template.md` on the
default branch. The GitHub Actions workflow and `gh` wrapper below apply only
to GitHub. The Azure publisher creates evidence but does not enforce a branch
policy. See [Microsoft's PR template guide](https://learn.microsoft.com/en-us/azure/devops/repos/git/pull-request-templates?view=azure-devops).

## 1. `AGENTS.md`: the contract

Paste this section into the project's `AGENTS.md` — the file Codex, OpenCode,
and T3 Code read. For Claude Code, add a one-line `CLAUDE.md` containing
`@AGENTS.md`, so every agent shares one source of truth.

````md
## PR contract: artifact required

Every PR needs a non-empty `## Artifact` section showing the before -> after
delta — UI, backend, data, infra, docs, refactors. Capture the baseline from the
base commit before changing code; keep the artifact reproducible (include the
command) and redact secrets. If no artifact is possible, leave the PR a draft
and say why.

Default quick pass: `npx visual-shot recap --diff origin/main...HEAD --only file-tree --format gfm`.
Full menu: the `pr-artifacts` skill. Gate: `node scripts/check-pr-artifact.mjs <body-file>`.
````

Keep this block short: it is injected into every session. The recipes stay in
the skill, and the raw patches stay out of the PR body.

## 2. `.github/pull_request_template.md`

The template puts the artifact first and gives the agent the exact shape to
fill:

```md
<!-- The artifact contract is in AGENTS.md. A non-empty `## Artifact` section
     is required before review; CI fails without it. -->

## What changed

<!-- One or two sentences. Link the issue. -->

## Artifact

<!-- REQUIRED. Headline evidence of the before -> after delta: image, terminal
     capture, table, JSON, or diagram. Full recap in a <details> block below.
     Redact secrets. -->

## How to verify

<!-- Exact commands a reviewer can run, and the expected result. -->

## Risk and rollback

<!-- What can break, and how to undo it. -->
```

## 3. `scripts/check-pr-artifact.mjs`

Copy the checker out of the installed skill (or run it in place):

```bash
mkdir -p scripts
cp .opencode/skills/pr-artifacts/scripts/check-pr-artifact.mjs scripts/
```

It validates a body from a file or stdin and exits `0` only when the
`## Artifact` section exists, is non-empty, and holds evidence (image, Mermaid,
code block, table, or link):

```bash
node scripts/check-pr-artifact.mjs .artifacts/body.md
gh pr view 123 --json body -q .body | node scripts/check-pr-artifact.mjs -
```

## 4. `.github/workflows/pr-artifact.yml`

The gate runs on body edits as well as pushes, so an agent can fix the
description without a new commit. Drafts and PRs labeled `skip-artifact`
(bots, dependabot) are exempt.

```yaml
name: pr-artifact
on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
permissions:
  contents: read
jobs:
  artifact:
    if: >-
      github.event.pull_request.draft == false &&
      !contains(github.event.pull_request.labels.*.name, 'skip-artifact')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check the PR body artifact
        env:
          PR_BODY: ${{ github.event.pull_request.body }}
        run: |
          printf '%s' "$PR_BODY" > pr-body.md
          node scripts/check-pr-artifact.mjs pr-body.md
```

If you cannot commit the script, run the check inline with
`actions/github-script` instead — but keep one implementation so CI and the
agent agree on what passes.

## 5. Install the skill for each agent

The artifact recipes need to be loadable at PR time, not only at session start:

```bash
npx agentic-tools install pr-artifacts                  # .opencode/skills/
npx agentic-tools install pr-artifacts --target claude  # .claude/skills/
npx agentic-tools install pr-artifacts --target agents  # .agents/skills/ (Codex)
```

Or install once per machine for every project:

```bash
npx agentic-tools install pr-artifacts --global --target claude
npx agentic-tools install pr-artifacts --global --target agents
```

For an Azure DevOps project, also install `visual-shot` and add a short pointer
to the project `AGENTS.md`:

````md
## PR artifacts

Follow `.agents/skills/pr-artifacts/SKILL.md`. For Azure DevOps publishing, use
`node_modules/visual-shot/docs/azure-devops.md`; its trusted pipeline example is
`node_modules/visual-shot/azure-pipelines.yml`. Discover MCP tool schemas before
using them. Do not use GitHub `gh` or temporary-commit instructions for Azure
Repos.
````

Copy `node_modules/visual-shot/azure-pipelines.yml` into the project and follow
its Azure DevOps setup steps only when a protected manual publisher pipeline is
needed. The MCP-only option does not create a native PR attachment.

OpenCode also auto-loads `.claude/skills/` and `.agents/skills/`, so one
project copy covers more than one agent.

## Optional: make the wrong path impossible

A wrapper removes the chance to forget. Agents call `scripts/open-pr.sh`
instead of `gh pr create`:

```bash
#!/usr/bin/env bash
# Render the baseline recap, require the artifact section, then open the PR.
set -euo pipefail
base="${BASE:-origin/main}"
npx visual-shot recap --diff "$base...HEAD" --only file-tree --format gfm --out .artifacts/recap.md --json
test -s .artifacts/recap.md
grep -q '^## Artifact' .artifacts/body.md || {
  echo "pr-artifacts: .artifacts/body.md needs a '## Artifact' section" >&2
  exit 1
}
gh pr create --body-file .artifacts/body.md "$@"
```

## Verify the setup

```bash
# The checker accepts evidence and rejects an empty section.
printf '## Artifact\n\n| before | after |\n|---|---|\n| 500 | 200 |\n' > /tmp/body.md
node scripts/check-pr-artifact.mjs /tmp/body.md          # exit 0
printf '## Artifact\n\n<!-- todo -->\n' > /tmp/body.md
node scripts/check-pr-artifact.mjs /tmp/body.md          # exit 1
```

In the `agentic-tools` pack itself, `npx agentic-tools doctor --json` must
report `ok: true` after any skill edit.
