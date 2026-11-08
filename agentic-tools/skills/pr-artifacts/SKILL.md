---
name: pr-artifacts
description: "Use before opening or updating a PR, or when setting up a project's artifact gate: before/after evidence for UI, backend, API, schema, perf, infra, and docs."
---

# PR Artifacts

Every PR carries evidence of its delta: not "tested locally", but an artifact a
reviewer can understand without reading the diff.

## Contract

- A non-empty `## Artifact` section before review, showing **before -> after**,
  not only the final state.
- Reproducible: include the command, or commit the source that produced it.
- Baseline captured before the change (see Workflow).
- If no artifact is possible, leave the PR a draft and say what is missing.

The checker runs before the PR is opened; CI is the backstop. Copy-paste setup:
[project setup](./references/setup.md).

## Workflow

1. **Capture the baseline before you edit.** Run the app, test, or benchmark in
   the working tree first and keep the output. This avoids a second dependency
   install and a second dev server. Only when the before state is already gone:

   ```bash
   git worktree add /tmp/pr-before origin/main
   ```

2. **Implement and test on the branch.** Reuse the baseline command and inputs,
   so both sides are comparable.

3. **Pick one headline** from the menu. One is enough; it is what the reviewer
   must understand in ten seconds.

4. **Render cheaply.** Default: a bounded mechanical recap of the change, no
   browser, no `visual-recap` load:

   ```bash
   npx visual-shot recap --diff origin/main...HEAD --only file-tree \
     --format gfm --out recap.md --json
   ```

   Write the headline in plain GFM (table, Mermaid, fenced terminal) or attach a
   PNG. Author `recap.json` (see `visual-recap`) only when the delta needs
   `image-pair`, `data-model`, or `api-endpoint` blocks:

   ```bash
   npx visual-shot recap --from recap.json --format gfm --out recap.md --json
   npx visual-shot recap --from recap.json --visuals-only --png --json
   ```

   Newer visual-shot collapses those two into one run (`--gfm-out`,
   `--png-filter`).

5. **Post it using the hosting service's instructions.** For Azure DevOps,
   follow [Azure DevOps publishing](./references/azure-devops.md); do not use
   the GitHub temporary-commit or `gh` steps below. For GitHub, put the headline
   at the top of `## Artifact` and the full recap in a `<details>` block. Keep
   only durable images (docs, examples) under
   `.artifacts/<slug>/`. For PR-only evidence: commit it alone under
   `.github/pr-assets/<topic>/` (`chore: add PR screenshots (temporary)`), push,
   delete it in the next commit (`chore: remove temporary PR screenshots`), and
   link the first commit's full SHA — never a branch or `raw.githubusercontent.com`:
   `![alt](https://github.com/<owner>/<repo>/raw/<full-sha>/.github/pr-assets/<topic>/<file>.png)`.
   Open the PR page and confirm the image renders.

6. **Verify before creating the PR.** Check the exact body file. For GitHub,
   create it with:

   ```bash
   node scripts/check-pr-artifact.mjs .artifacts/body.md
   gh pr create --body-file .artifacts/body.md
   ```

   For Azure DevOps, create a draft PR first if no PR exists, then publish its
   evidence using the Azure reference. Preserve a non-empty `## Artifact`
   section in the description with the image or a link to the evidence comment.
   Validate the final body with the same checker, then mark the draft ready
   through the discovered PR write tool. Keep the description below 4,000
   characters and use a managed comment for larger evidence.

   Require exit `0`; every render must report `ok: true` and `warnings: []`.

## Artifact menu

| Change | Headline | Capture |
|---|---|---|
| UI / docs | before/after screenshot | `visual-shot diff <before-url> <after-url>`, or capture twice + `diff` for element/wait control |
| Bug fix | failing -> passing test | `visual-shot term` in both worktrees |
| API / schema | payload or data-model delta | recap `api-endpoint`, `json`, `data-model` |
| Perf / flow / refactor | table, chart, or diagram | recap `table`, `mermaid`, `file-tree` |

Per-type recipes: [change types](./references/change-types.md).

## Quality bar

- The before state is real; both sides use the same command, inputs, and
  machine. Numbers need `n`, machine, and variance; never chart one run.
- Redact secrets, tokens, customer data, and `.env` values.
- Prefer PNG/SVG over video; motion only when motion is the point.
- Avoid artifact theater: green tests with no failing baseline, unannotated
  screenshots, unitless charts.
- No visual-shot? A table, Mermaid fence, fenced log, or committed screenshot
  still satisfies the contract.

The gate: [project setup](./references/setup.md) has the `AGENTS.md` block, PR
template, CI workflow, and checker.
