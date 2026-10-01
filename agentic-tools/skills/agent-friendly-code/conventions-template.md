# Agent conventions template

Adapt this into the target project's agent instruction file (usually `AGENTS.md`;
`CLAUDE.md`, `.cursor/rules/`, or `.github/copilot-instructions.md` also count).
Fill every `<placeholder>` and delete any rule the project's tooling already
enforces. Keep the result short and imperative: it is re-read every session, so
each line spends context.

---

## Project facts

- Entry points: `<paths>`
- Architecture: `<one or two lines, e.g. request -> service -> store>`
- Generated or vendored, do not edit: `<paths>`

## Code rules

- **Units:** one responsibility per function/module; split by responsibility,
  not line count. Target under ~300 lines per file; no file past ~500.
- **Names:** specific and grep-unique. Avoid `data`, `handler`, `manager`,
  `service`, `utils`, `helper`.
- **Comments:** why and provenance (issue or commit) only; update with the
  code; no obvious what-comments; never secrets or personal data.
- **Types:** explicit on public signatures; no `any` or untyped collections.
- **Duplication:** one source of truth per decision; extract before a third
  copy.
- **Tests:** run headless with `<test command>`; new behavior and bug fixes land
  with tests.
- **Structure:** follow `<framework>` conventions and the existing
  `<path pattern>`.
- **Dependencies:** inject through parameters or constructors; wrap third-party
  libraries behind `<interface>`; read config once into `<constant>`.
- **Control flow:** early returns and guard clauses; at most two indent levels.
- **Errors:** include the offending value and expected shape; never swallow.
- **Resilience:** apply `<patterns, e.g. timeouts, retries, circuit breakers,
  fallbacks>` on external calls.
- **Formatting:** run `<formatter>`; do not hand-format or debate style.
- **Logs:** structured `<format>` for machine readers; no secrets or personal
  data.
- **Setup:** `<bootstrap command>` reaches a working state from a clean
  checkout.

## Commands

- Test: `<single headless command>`
- Lint / typecheck: `<command>`
- Format: `<command>`
- Bootstrap: `<command>`
