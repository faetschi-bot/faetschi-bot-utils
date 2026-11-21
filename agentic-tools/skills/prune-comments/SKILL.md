---
name: prune-comments
description: "Invoke when asked to delete or sweep comments, lower a comment baseline, continue a comment ban, or judge whether a comment should stay. Sorts each hit into tautology, stale, excuse, or decision record; tranche-based, never grep-only."
---

# Prune Comments

A comment must earn its line: the only comment worth keeping is one the code
cannot show. Sort every candidate into one of four categories and act per
category. Repository-specific commands, decision-record formats, and review
gates live in the target project's `AGENTS.md` and CI config. Read those first.
This skill defines the bar, not the commands.

## Categories

- **Tautology** (restates what the code shows, like `i++; // increment i`):
  delete.
- **Stale** (references code, files, flags, or behavior that no longer exist):
  delete. In a mixed comment, delete the stale clause and keep the live claim
  verbatim.
- **Excuse** (`shortcut:`, TODO, FIXME, HACK, "for now", a workaround's
  justification): record it first — one issue per distinct hack in the
  project's tracker, carrying file, line, the limit, and the upgrade
  condition — then delete the comment.
- **Decision record** (a non-obvious contract or choice the code cannot show):
  keep as a per-symbol doc comment in place. If it is cross-cutting and the
  project has a decision-record home (`docs/decisions/`, an ADR directory, an
  RFC file), mirror the format of the existing records and delete the comment.
  If no home exists, do not invent one unasked; keep the comment and report
  it as a follow-up. A decision record that claims a constraint someone
  could violate (`do not remove`, `do not change this wording`, `talk to X
  before changing`) is an unenforced claim: offer the cheapest encoding —
  a type, a runtime check, a test, or a lint — wait for approval, encode it,
  and delete the comment. If declined, keep the comment and report the
  constraint open.

Doc comments that state an API contract (godoc, docstrings, JSDoc a tool
consumes) are usually decision records; judge them by the same categories
instead of blanket-deleting. One exception: a doc comment that is the only
documentation of a public API is never deleted for being tautological —
rewrite it in place to state the contract.

## Safety rules

- Never delete on a grep match alone. Read every hit in its file first;
  codebases often use words like "legacy", "stale", and "temporary" as domain
  terms.
- Never touch pragmas and tool directives: shebangs, `//go:`, `#![...]`,
  `@ts-`, `@vitest`, `eslint-disable`, `@formatter`, region markers, and
  anything else a compiler, linter, or doc tool parses — including
  `# type:` and `# noqa` in Python, and `#` lines in C, which are
  preprocessor, not comments.
- Never touch license headers.
- Match a prefix only in files where it is the comment token: `#` in
  Markdown is a heading, and `--` in a shell script may be an operator.
  Scope each prefix's file globs to the languages that use it.
- Skip generated and vendored paths — whatever the project's ignore files
  exclude (for example `dist/`, `vendor/`, `node_modules/`).
- When a hit's category is ambiguous, keep the comment. The next tranche
  can delete it once the doubt is resolved; a wrong deletion has to be dug
  out of history.

## Workflow

1. Pick one tranche: a package, a directory, a single marker sweep across
   the tree, or the current branch's diff against its base when the request
   is about the change, not the tree. Never attempt the whole tree in one
   pass.
2. Hunt with every line-comment prefix the project's languages use; a
   slash-only sweep misses shell, Python, Ruby, SQL, and ini files:
   - `git grep -I -n -i -E '^\s*(//|#|--|;|%).*(TODO|FIXME|HACK|shortcut:|workaround|for now)'`
   - stale pointers: grep for paths of deleted files, but verify against
     `git ls-files` before calling a reference stale;
   - adapt the marker list and the file globs to the languages actually
     present.
3. Categorize each hit by reading it in context. Delete tautologies and stale
   text. Before deleting an excuse, file the issue: derive the tracker from
   `git remote` or the project's `AGENTS.md`. If the tranche turns up more
   than a handful of distinct hacks, confirm the issue batch with the user
   before filing; do not flood the tracker. For a cross-cutting decision,
   mirror the project's existing decision-record format.
4. Verify the tranche:
   - inspect the diff: every removed line must be comment text (plus any
     new decision record or lowered-baseline file); a code change means
     stop and re-categorize;
   - run the project's formatter on every touched file (empty diff passes);
   - if the project has a comment-count baseline gate, run it with its update
     flag after deletions only — it must refuse growth and lower the
     baseline;
   - run the project's changed-file gate (lint, typecheck, tests) exactly as
     its policy requires.
5. Commit the deletions and the lowered baseline together. The baseline total
   must not grow. If the project has no baseline gate, the formatter plus
   changed-file gate is the whole check. New files arrive with zero comment
   lines where a gate enforces this; review does not.

## Report

End every tranche with: deletions per category, issues filed with links,
decision records written or kept, encoding offers made and their outcome,
comments kept as ambiguous, and any open out-of-tranche work.
