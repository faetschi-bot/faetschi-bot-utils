---
description: "Review the workspace changes for correctness, adequacy, and security, with severity-classified findings"
---

Review the changes made in this workspace.

Review the changes in this workspace and judge whether they are correct and adequate — not just whether they contain catastrophic bugs.

The diff is the source of truth. Read the relevant code around the diff too, not only the diff itself, so you understand the change in context.

First, understand the intent and whether it was achieved:
- Work out what these changes are trying to do — the intent behind them — from the diff and the surrounding code.
- Judge whether the implementation actually achieves that intent, and whether it is the smallest correct way to do it. Call out where the change is incomplete, only partially solves the goal, misses cases it clearly set out to handle, or solves it in a way that will not hold up.

Then look for concrete problems. Report real failure modes, not abstract suspicions, and do not nitpick without impact.

Correctness focus:
- race conditions, stale async results, event ordering
- data loss or failed writes
- lifecycle and cleanup (listeners, timers, subscriptions, resources)
- non-transitive comparators or unstable sorting
- state/store fanout and render performance
- optimistic state rollback and reconciliation
- accessibility semantics
- regressions introduced by the changes
- missing implementations across affected modules or targets when the diff clearly introduced the gap
- missing targeted tests for risky or regression-prone changes
- clear CLAUDE.md or AGENTS.md violations that apply to the changed files

Security and supply-chain focus (when the diff touches these):
- dependencies, build/release/CI scripts
- auth, tokens, secrets, credentials
- filesystem boundaries and path traversal
- shell execution
- network calls, telemetry, exfiltration
- IPC, native bridge, updater, desktop shell
- hidden behavior behind small diffs or broad refactors

Do not report:
- pre-existing issues unrelated to the diff
- pedantic nitpicks a senior engineer would not flag, or issues a linter would catch
- subjective style preferences not required by CLAUDE.md or AGENTS.md
- speculative concerns you cannot tie to a concrete failure
- rules mentioned in CLAUDE.md or AGENTS.md but explicitly silenced in the code

Validation pass:
- Before reporting an issue, re-check it against the diff plus only the context you actually read.
- For CLAUDE.md or AGENTS.md violations, verify the rule applies to the affected file path and cite the exact rule.
- If you cannot tie a finding to a concrete impact, drop it.

Classify each finding:
- blocker: likely regression, data loss, security issue, broken invariant, or a serious correctness problem — or the change does not actually achieve its intent
- non-blocker: a real but minor issue, a test gap, or a maintainability concern
- nit: mention only if useful, never treat as blocking

This is a review only — do not edit, fix, or commit anything unless the user asks you to.

Output:
- Start with one or two sentences: what the change does and whether it achieves its intent.
- Then list findings grouped by severity. For each: short title, why it is a real problem, the affected file path, and category (correctness / security / rule violation / adequacy gap).
- If you find nothing real, say so plainly instead of inventing findings.

Keep the review concise and practical. Respond in the same language the user uses.
