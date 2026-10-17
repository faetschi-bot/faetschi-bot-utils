---
name: pr-artifacts
description: "Use when opening or updating any pull request, or when setting up a project's artifact gate. Requires evidence in every PR — UI, backend, API, schema, perf, infra, refactor, or docs — with a real before/after captured from the base commit, rendered with visual-shot or plain Markdown, and checked before review."
---

# PR Artifacts

Every pull request carries evidence of its delta. Not a status line ("tested
locally"), not a link back to the diff — an artifact a reviewer can look at and
understand **what changed, why, and how you know it works**.

The obligation is not UI-only. A backend change needs evidence as much as a
button redesign; only the medium differs (terminal capture, before/after
payload, schema diff, benchmark table, sequence diagram), not the requirement.

This skill defines the contract, the before/after capture, the artifact menu by
change type, and the checker that makes the contract real.

## The contract

The project's `AGENTS.md` carries this contract (copy-paste block in
[project setup](./references/setup.md)):

- Every PR contains a non-empty `## Artifact` section before it is marked ready
  for review.
- The artifact shows the delta, not only the final state: **before → after**.
- The artifact is reproducible: include the command, or commit the source that
  produced it.
- The baseline is captured from the base commit **before** the change, in a
  separate worktree, not reconstructed from memory afterward.
- If no artifact is possible, the PR stays a draft and says what is missing.

"Should" decays. The contract is enforced by a checker the agent runs before
opening the PR, and by CI as a backstop.

## Workflow

1. **Capture the baseline first.** The moment you know the change is PR-sized:

   ```bash
   git worktree add /tmp/pr-before origin/main
   ```

   Run the app, test, benchmark, or command there and keep the raw output. This
   is the step agents skip, and skipping it is what makes artifacts fake.

2. **Implement and test on the branch.** Keep the exact commands and inputs the
   baseline used, so the two sides are comparable.

3. **Pick one headline artifact** from the menu below. One, not five: it is what
   the reviewer must understand in ten seconds. Everything else is detail.

4. **Render.** For anything larger than a one-liner, author a `recap.json` (see
   the `visual-recap` skill) and render it:

   ```bash
   npx visual-shot recap --from recap.json --format gfm --out recap.md --json
   ```

   With a browser provisioned, also render the visual surfaces that add signal:

   ```bash
   npx visual-shot recap --from recap.json --visuals-only --png --png-out recap-visuals.png --json
   ```

5. **Post it.** Put the headline at the top of `## Artifact`, the full recap in
   a `<details>` block, and commit images under `.artifacts/<slug>/` (or the
   project's artifact directory). Reference committed files by raw URL:
   `https://github.com/<owner>/<repo>/blob/<branch>/.artifacts/<slug>/<file>.png?raw=true`.

6. **Verify.** Run the checker on the exact body you are about to submit:

   ```bash
   gh pr view --json body -q .body | node scripts/check-pr-artifact.mjs -
   ```

   Require exit `0`. Every `visual-shot` render must report `ok: true`; inspect
   its `warnings` array, which is `[]` when clean.

## Artifact menu

| Change | Headline artifact | Capture |
|---|---|---|
| UI behavior | Before/after screenshot, or a short clip when motion is the point | `visual-shot` captures + `visual-shot diff` |
| Bug fix | Failing test on the base commit → passing on the branch | `visual-shot term` in both worktrees |
| API contract | Before/after request + response (status and body) | recap `api-endpoint` + `json` blocks |
| DB/schema | ERD or migration diff with `added`/`removed`/`modified` marks | recap `data-model` |
| Performance | Before/after table (p50/p95, n, variance) and a chart only if a trend matters | recap `table`; rendered Mermaid chart |
| Concurrency/flow | Sequence diagram of the new path and its failure branches | recap `mermaid` |
| Refactor | File map plus call/dependency graph and LOC delta | recap `file-tree` + `diagram` |
| Infra/config | Rendered plan or diff (`terraform plan`, `kubectl diff`) | `visual-shot term` |
| Dependencies/security | Before/after audit or scan table | `term` or recap `table` |
| Docs | Rendered page before/after, or a section-level diff | capture + `diff` |

Per-type recipes, including the exact base-worktree commands, are in
[change types](./references/change-types.md).

## Quality bar

- The before state is real and from the base commit. Both sides use the same
  command, inputs, and machine, or the difference is stated in the PR.
- Numbers include `n`, machine, and variance. Never chart a single run.
- Redact secrets, tokens, customer data, and `.env` values from every capture;
  terminal output and JSON payloads leak them easily.
- Prefer PNG/SVG over GIF/video. Record motion only when motion is the point;
  keep clips short (under ~10s) and small (under ~5 MB).
- A reviewer understands the headline in ten seconds without opening the diff.

Artifact theater to avoid: a green test screenshot with no failing baseline; an
unannotated full-page screenshot; a chart without units or axes; a restated
diff dressed up as a diagram; an image nobody can reproduce.

## Without visual-shot

The contract is tool-agnostic. Any of these satisfies it: a Markdown table, a
Mermaid fence in the PR body, a fenced terminal log, a screenshot committed by
any tool, or a link to a CI job result. `visual-shot` makes the render
reproducible and diffable; it is not the requirement.

## Projects that need the gate

[Project setup](./references/setup.md) has the `AGENTS.md` contract block, the
PR template, the CI workflow, the checker script, and the per-agent install
commands (OpenCode, Claude Code, Codex).
