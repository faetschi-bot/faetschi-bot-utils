---
description: "Run one focused tranche of the comment sweep: delete what the code already shows, record excuses as issues first, keep real decision records"
---

Run one focused tranche of the comment sweep, then stop and report.

Judge every candidate comment against four categories:

1. **Tautology** — restates what the code shows. Delete.
2. **Stale** — references code, files, or flags that no longer exist. Delete; in a mixed comment, delete only the stale clause and keep the live claim verbatim.
3. **Excuse** — TODO, FIXME, HACK, `shortcut:`, "for now". File one issue per distinct hack in the project's tracker first (file, line, the limit, the upgrade condition), then delete the comment.
4. **Decision record** — a non-obvious contract or choice. Keep per-symbol doc comments in place. Move cross-cutting ones into the project's decision-record home, mirroring its format, and delete the comment; if no such home exists, keep the comment and note it as a follow-up. A claimed constraint (`do not remove`, `talk to X first`) is an unenforced claim: offer the cheapest encoding (type, test, lint), and on approval encode it and delete the comment.

Operating rules:

- One tranche per run (a package, a directory, one marker sweep, or the branch's diff against its base), never the whole tree in one pass.
- Hunt with every line-comment prefix the project's languages use; a slash-only sweep misses shell and Python.
- Read every hit in context; never delete on a grep match alone.
- Never touch pragmas, tool directives, shebangs, license headers, or generated and vendored paths. Match each prefix only in files where it is the comment token (`#` in Markdown is a heading, in C the preprocessor).
- The diff must remove comment lines only; any code change means stop and re-judge.
- When a category call is ambiguous, keep the comment. Confirm the issue batch with the user before filing more than a handful. Never delete the only documentation of a public API; rewrite it to state the contract.
- Report deletions per category, issues filed, records written or kept, encoding offers and their outcome, and open work.
- Verify: run the project's formatter on touched files; run the project's comment baseline gate if it has one and never let the baseline grow; run the changed-file gate (lint, typecheck, tests).
- Commit deletions together with the lowered baseline when one exists.
