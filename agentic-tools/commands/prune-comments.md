---
description: "Run one focused tranche of the comment sweep: delete what the code already shows, record excuses as issues first, keep real decision records"
---

Run one focused tranche of the comment sweep, then stop and report.

Judge every candidate comment against four categories:

1. **Tautology** — restates what the code shows. Delete.
2. **Stale** — references code, files, or flags that no longer exist. Delete; in a mixed comment, delete only the stale clause and keep the live claim verbatim.
3. **Excuse** — TODO, FIXME, HACK, `shortcut:`, "for now". File one issue per distinct hack in the project's tracker first (file, line, the limit, the upgrade condition), then delete the comment.
4. **Decision record** — a non-obvious contract or choice. Keep per-symbol doc comments in place. Move cross-cutting ones into the project's decision-record home, mirroring its format, and delete the comment; if no such home exists, keep the comment and note it as a follow-up.

Operating rules:

- One tranche per run (a package, a directory, or one marker sweep), never the whole tree in one pass.
- Hunt with every line-comment prefix the project's languages use; a slash-only sweep misses shell and Python.
- Read every hit in context; never delete on a grep match alone.
- Never touch pragmas, tool directives, shebangs, license headers, or generated and vendored paths.
- Verify: run the project's formatter on touched files; run the project's comment baseline gate if it has one and never let the baseline grow; run the changed-file gate (lint, typecheck, tests).
- Commit deletions together with the lowered baseline when one exists.
