---
name: deepen-simplify
description: "Use when asked to deepen modules, simplify interfaces, or reduce complexity in existing code. Surgical, behavior-preserving refactoring: audit first, then land only the highest-ranked simplification."
---

# Deepen & Simplify

Deepen modules and simplify interfaces. Surgical, behavior-preserving.

**Deep** = a caller can use it correctly without reading its body.
**Simple** = the caller must know fewer things: params, modes, ordering rules,
error cases it has to handle.

The target project's conventions win over this skill's defaults.

## Phase 1 — Audit (no edits)

Find the biggest complexity sinks:

- one rule implemented in two places
- wrappers that only forward
- callers that must know internal state or call order

Rank by complexity removed and call sites simplified, highest first; break ties
by smallest diff.

For the top 3, report: files, the leak, the interface afterward, LOC delta, and
the test that proves behavior is unchanged. Wait for a pick.

## Phase 2 — Implement only #1

- Delete more than you add. No new deps.
- No behavior change. No public API change without asking.
- Untested code: write the characterization test first, or leave it alone.
- If it becomes a rewrite or spreads past ~5 files, stop and report instead.

## Output

What got deeper, files touched, LOC before → after, tests run, and what you
deliberately left alone.
