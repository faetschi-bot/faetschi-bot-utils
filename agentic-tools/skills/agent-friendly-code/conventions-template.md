# Agent conventions template

Adapt this into the target project's agent instruction file (usually `AGENTS.md`;
`CLAUDE.md`, `.cursor/rules/`, or `.github/copilot-instructions.md` also count).
This is a starting point, not a definitive version: fill every `<placeholder>`,
delete any rule the project's tooling already enforces, and add rules the
project needs. Keep the result short and imperative — it is re-read every
session, so each line spends context.

---

## Project facts

- Entry points: `<paths>`
- Architecture: `<one or two lines, e.g. request -> service -> store>`. Keep a
  matching high-level overview in the README, with a simple diagram where it
  helps.
- Generated or vendored, do not edit: `<paths>`
- Setup: `<bootstrap command>` is idempotent and reaches a working state from a
  clean checkout.
- Resilience: apply `<patterns, e.g. timeouts, retries, rate limits, fallbacks>`
  on external calls.

## Code style

- Functions: 4-20 lines. Split if longer.
- Files: under 500 lines, ideally under 300. Split by responsibility.
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`. Prefer names
  that return fewer than 5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 2 levels of indentation.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry intent and
  provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because of a
  specific bug or upstream constraint.
- Update comments in the same change; a comment that contradicts the code is a
  bug.
- Never put secrets, credentials, or personal data in comments.

## Tests

- Tests run with a single command: `<project-specific>`, headless, with no
  manual setup and no external secret.
- Every new function gets a test. Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes, not inline
  stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable, self-validating,
  timely.

## Dependencies

- Inject dependencies through constructor/parameter, not global/import.
- Wrap third-party libs behind a thin interface owned by this project.
- Read configuration once into a named constant or module.

## Structure

- Follow the framework's convention (Rails, Django, Next.js, etc.).
- Prefer small focused modules over god files.
- Predictable paths: controller/model/view, src/lib/test, etc.
- Keep generated and vendored trees out of the source paths.

## Formatting

- Use the language default formatter (`cargo fmt`, `gofmt`, `prettier`,
  `black`, `rubocop -A`). Don't discuss style beyond that.

## Logging

- Structured JSON when logging for debugging / observability; no secrets or
  personal data in logs.
- Plain text only for user-facing CLI output.

## Commands

- Test: `<single headless command>`
- Lint / typecheck: `<command>`
- Format: `<command>`
- Bootstrap: `<command>`
