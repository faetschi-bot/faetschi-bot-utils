# Change types and their artifacts

One headline artifact per PR. Pick the row that matches the change; the full
recap carries the detail.

## Baseline (every type)

Capture the before state **before editing**, in the working tree you already
have. That costs no second install or dev server. If the state is already gone,
recreate it:

```bash
git worktree add /tmp/pr-before origin/main   # or the PR's base branch
# run the project's setup inside the worktree when the toolchain needs it
```

Both sides must use the same command, inputs, and machine. If something cannot
be reproduced, state that in the PR body instead of hiding it behind an
impressive-looking capture.

## UI behavior

For a simple page, `diff` captures both URLs itself — one process, one browser:

```bash
npx visual-shot diff http://127.0.0.1:3000/ http://127.0.0.1:3001/ \
  --out tmp/images/PRs/after-vs-before.png --json
```

When you need `--wait-for`, `--element`, `--full-page`, or the console-error
gate on each side, capture separately and pass the files to `diff`:

```bash
npx visual-shot --url http://127.0.0.1:3000/ --name before
npx visual-shot --url http://127.0.0.1:3001/ --name after
npx visual-shot diff tmp/images/PRs/before.png tmp/images/PRs/after.png \
  --out tmp/images/PRs/after-vs-before.png --json
```

Capture the changed element or focused sub-surface; a whole dashboard hides the
delta. Inspect `consoleErrors`/`pageErrors` in the `--json` result — a non-zero
exit means the page broke, even if the image looks fine. For menus and short
interactions, record only when motion is the reviewed behavior.

## Bug fix

```bash
# on the base state: the regression test fails (exit 1 is expected; the image
# is still written)
npx visual-shot term --title "before: repro fails" --fail-on-error -- npm test -- --filter <name>
# on the branch: the same test passes
npx visual-shot term --title "after: repro passes" -- npm test -- --filter <name>
```

A green test screenshot with no failing baseline proves nothing. If the test
did not exist before the fix, write it first, show it failing on the base
commit, then show it passing.

## API contract

```bash
curl -sS -o before.json -w '%{http_code}\n' http://127.0.0.1:3000/api/x
curl -sS -o after.json  -w '%{http_code}\n' http://127.0.0.1:3001/api/x
```

Use a recap `api-endpoint` block for the contract delta and `json` blocks for
the payloads. Include status codes and error bodies, not only the happy path.

## DB and schema

Show the migration plus what it does to the model: a recap `data-model` block
with `change: added|removed|modified` and `was` for renamed fields or types.
When the migration is the risk, add a rendered `psql \d` / `sqlite .schema`
capture from both worktrees.

## Performance

- Benchmark in both worktrees, same machine, same inputs, `n >= 5`.
- Report p50/p95, `n`, and variance in a recap `table`; add a chart only when a
  trend matters.
- Mermaid `xychart-beta` renders through `visual-shot diagram` to PNG; GitHub's
  Markdown preview may not render that diagram type, so embed the PNG instead
  of the fence.
- Never chart a single run, and never compare numbers from different machines.

## Concurrency and flow

A recap `mermaid` sequence or flowchart: actors, the new lock/queue/retry path,
and its failure branches. Pair it with `annotated-code` on the critical section
so the diagram is anchored to real lines.

## Refactor

recap `file-tree` for the footprint, an HTML `diagram` for the call or
dependency graph, and `git diff --stat` for the LOC delta. State "no behavior
change" explicitly, and name the tests that prove it.

## Infra and config

```bash
npx visual-shot term --title "terraform plan" -- terraform plan -no-color
npx visual-shot term --shell "kubectl diff -f k8s/ 2>&1 | tail -60"
```

Redact account IDs, ARNs, and connection strings before committing the image.

## Dependencies and security

`npm audit --json` (or the ecosystem equivalent) before and after, rendered as
a table: new, resolved, and still-open advisories, and whether the vulnerable
path is actually reachable. A passing scanner badge is not the artifact; the
diff in findings is.

## Docs

Capture the rendered page before/after like UI, or use `diff`/`notes` blocks
for section-level changes. Docs PRs are not exempt from evidence.

## Fallbacks

No visual-shot, no browser, or no running app: a Markdown table, a Mermaid
fence, a fenced log, or a screenshot committed from any tool all satisfy the
contract. Say which command produced it so a reviewer can reproduce it. The
requirement is evidence, not tooling.

## Cost knobs

- `--wait-for <sel>` (or `--wait 0`) instead of the 1 s settle.
- `--scale 1` when the PNG is only embedded or diffed; capture defaults to 2.
- `--no-highlight` when syntax color adds nothing.
- `--report-url` / `--image-url` emit links in the recap instead of hand-built
  raw URLs.
- Keep the PR-body recap bounded: `recap --diff … --only file-tree`. Raw patches
  duplicate the Files tab and dominate the body size.
