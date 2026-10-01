---
name: agent-friendly-code
description: "Invoke when writing or changing code another agent will read, when auditing a codebase for agent-hostile structure, or when setting up a project's agent instruction file. Applies the read-time cost bar to your own edits — searchable units, grep-unique names, provenance comments, explicit types, headless tests, injectable dependencies — and reports findings with evidence."
---

# Agent-Friendly Code

Code's primary reader is increasingly the next agent that has to search it, load
it, edit it, and run its tests. That reader works under hard limits: reads are
chunked, attention degrades as context grows, search is the navigation API, and
every tool call costs tokens and wall-clock time. Structure is not taste; it is
the context and navigation interface.

The target project's `AGENTS.md` and conventions win over this skill's defaults.
Read them first. When the project's instruction file is the cause of a problem,
fix it in [Conventions](#conventions) mode rather than silently diverging.

## Modes

- **Authoring** — while writing or changing code. Apply the
  [authoring bar](#authoring-bar) to your own edit before you report done; do
  not wait to be asked.
- **Audit** — to find agent-hostile code in an existing area. Discovery is
  read-only and [evidence comes first](#audit); land one coherent batch per
  change.
- **Conventions** — to set up or tune the project's agent instruction file from
  the [template](./conventions-template.md).

## Authoring bar

Ordered by navigation impact for the agent, not by severity. Apply them to your
own diff even when the task does not mention code quality.

1. **Units fit one read.** One thing per function, one responsibility per
   module. Aim for functions that stay in view (roughly 4-20 lines) and files a
   few hundred lines at most; split well before ~500. Split by responsibility,
   never by line count — a mechanical split adds navigation instead of removing
   it. Test: could a reader load this unit in one tool call and hold it whole?

2. **Names are the search index.** Prefer specific names
   (`UserRegistrationValidator`, `InvoiceLineItemTotal`) over generic stems
   (`data`, `handler`, `manager`, `service`, `utils`, `helper`, `process`). If
   grepping the name returns mostly unrelated hits, rename it. Uniqueness
   matters most for internal symbols; do not churn exported or cross-module
   APIs for grep aesthetics, and ask before renaming a public surface.

3. **Comments carry why and provenance.** Keep the production bug, business
   constraint, ordering requirement, or upstream workaround that explains the
   choice; reference the issue or commit. Public interfaces get a docstring
   with intent and one usage example. Skip what-comments (`// increment i`):
   the reader parses the syntax natively. Update comments in the same change —
   a comment that contradicts the code is a bug. Do not delete a prior
   author's provenance comment during a refactor unless the information is
   preserved somewhere better. Never write secrets, credentials, or personal
   data into comments or logs.

4. **Types at boundaries.** Explicit parameter and return types on public
   functions; no `any`, no untyped collections, no implicit states where the
   language supports typing. Types answer what goes in, what comes out, and
   which states are valid, saving the reader an inference pass.

5. **One source of truth (DRY).** Before adding a third copy of a block,
   extract it. An agent updating one copy will not find the others, and subtle
   variation between copies guarantees inconsistent behavior. DRY protects
   decisions, not repeated-looking lines: do not force an abstraction over
   coincidental similarity.

6. **Tests run headless.** The project's test command is documented, creates
   its own data, needs no human setup or external secret, and prints parseable
   output. New behavior lands with a test; a bug fix lands with a regression
   test that failed before the fix. Leave test-value judgments (duplication,
   implementation coupling) to the project's testing guide or the `test-audit`
   skill when available; this skill only requires that the loop be runnable.

7. **Structure is predictable.** Follow the framework's conventions and mirror
   existing paths, so the home of a new file is obvious before it is created.
   Keep generated, vendored, and migration trees clearly separated from
   source.

8. **Dependencies are injectable.** Accept collaborators through parameters or
   constructors, not internal instantiation. Wrap third-party libraries behind
   a thin project-owned interface. Read configuration once into a named
   constant or module, so swapping a provider, model, or credential is a
   one-place change.

9. **Flat control flow.** Guard clauses and early returns; keep body
   indentation at two levels or fewer. Replace nested conditionals with named
   predicates, and hold each piece of state in one place per function.

10. **Errors carry context.** Include the offending value, the expected shape,
    and enough identity to locate the failure — `ValueError("invalid input:
    received None, expected non-empty digit string")`, not
    `ValueError("invalid input")`. Never swallow an error silently.

11. **Formatting is mechanical.** Run the project formatter and accept its
    output. Do not hand-format or debate style in a change; one consistent
    style keeps pattern-based greps and token-by-token reading cheap.

12. **Docs, logs, and setup serve both readers.** Keep the README and agent
    instruction file current for shape, commands, and caveats. Use structured
    logs (named fields or JSON) for machine readers and free text only for
    human output. Setup must be idempotent and documented, so a fresh agent
    reaches a working state from a clean checkout.

## Audit

Read the project's `AGENTS.md` and CI config before scanning, and keep
discovery read-only. Rank findings by navigation cost, not style taste. The
scans below seed candidates; each candidate still needs evidence:

1. Instruction files: missing or stale `AGENTS.md`/`CLAUDE.md`, an undocumented
   test command, setup that is not idempotent.
2. Oversized units: files past a few hundred lines, functions that cannot be
   read in one view.
3. Names: generic stems across the tree; count hits per name and flag names
   whose hits are mostly irrelevant.
4. Types: `any`, untyped collection literals, untyped public signatures.
5. Duplication: repeated literal blocks or near-identical functions; use the
   project's duplication tooling if it has any, otherwise sample.
6. Test loop: run the documented command from a clean checkout; note every
   manual step it needs.
7. Comments: obvious what-comments, and comments that contradict the code.
8. Nesting: three or more indent levels outside data literals.
9. Errors: short opaque messages passed to raise/throw/rescue.
10. Structure: paths that break the framework's pattern, and source mixed with
    generated or vendored trees.

Report before editing. For each candidate record its location and symbol, the
agent cost it imposes (an extra read, an ambiguous grep, hidden state), the
smallest behavior-preserving fix, and the test that proves the fix is safe.

Fix one coherent batch at a time. Never refactor working code for aesthetics
alone; if the unit has no coverage, add or run proof first. Leave generated,
vendored, migration, and fixture code alone. When a sweep is too large for one
batch, report the inventory and land the highest-cost subset with named
follow-ups instead of one giant diff.

## Conventions

The bar holds only when the project states it where every session reads it.
Encode project-specific choices; do not paste this skill into `AGENTS.md`.

1. Find the instruction file the target agent reads: `AGENTS.md`, `CLAUDE.md`,
   `.cursor/rules/`, or `.github/copilot-instructions.md`. Prefer the existing
   one; keep one canonical file and point the others at it.
2. Add only what this skill cannot know: the headless test command, lint,
   typecheck and format commands, entry points, architecture shape, generated
   or vendored boundaries, and bootstrap steps.
3. Delete rules the language's tooling already enforces. Keep the file short
   and imperative — it is re-read every session, so each line spends context.
   Move long explanations to linked docs.
4. Start from [conventions-template.md](./conventions-template.md) and fill
   every placeholder. If the project already has an instruction file, integrate
   instead of replacing it.
5. Re-run the documented commands exactly as written before claiming they work.

## Validation

1. For a refactor, run the narrowest tests for the touched units, then the
   project's full test command; behavior must be unchanged unless the task
   itself changed it.
2. For new code, run the project's gate the way CI runs it: format, lint,
   typecheck, tests.
3. Run the project formatter on changed files, then `git diff --check`.
4. Confirm the diff does not change public contracts, output formats, or
   behavior beyond the task.

## Handoff

Report:

- mode and scope;
- findings by category, with counts and the highest-cost offenders;
- instruction-file changes and the commands they document;
- edits per coherent batch and the tests that proved them safe;
- remaining candidates and named follow-ups not attempted;
- anything you could not verify.

## Origin

Distilled from Fabio Akita, "Clean Code for AI Agents"
(https://akitaonrails.com/en/2026/04/20/clean-code-for-ai-agents/), with the
line thresholds kept as defaults rather than laws, and secrecy, comment
staleness, and refactor-churn rules added by this pack.
