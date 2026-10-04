# Contributing

Thanks for helping. This repo is a monorepo of small, self-contained tools.
Start with [`AGENTS.md`](./AGENTS.md), which links each tool's own agent guide —
those files are the authoritative notes for that tool.

## Ground rules

- Keep every tool **self-contained**. Do not add cross-tool imports or a shared
  runtime dependency between tools.
- **Read a tool's `AGENTS.md` and `--help` instead of guessing from source.**
- Keep `npm test` green in any tool you touch, and run that tool's checks below.
- Change **one tool per pull request** where practical, so CI scope stays clear.

## Workflow

1. Branch from `main`.
2. Make your change inside the relevant `<tool>/` directory.
3. Run that tool's checks (below).
4. Open a pull request. CI runs the matching `ci-<tool>.yml` workflow; only the
   affected tool's workflow is triggered.
5. **Do not push release tags.** Releases are automated on merge — see
   [Releasing a tool](./README.md#releasing-a-tool).

## Checks

All tools require **Node 20+**. Run these from inside the tool's directory:

| Tool | Test | Extra checks |
|------|------|--------------|
| [`visual-shot/`](./visual-shot) | `npm test` | `npm run check`, `npm run lint:sh` |
| [`outbound/`](./outbound) | `npm test` | — |
| [`agentic-tools/`](./agentic-tools) | `npm test` | `npm run validate` |
| [`mention-agent/`](./mention-agent) | `npm test` | `npm run check`, `npm run self-check` |
| [`session-search/`](./session-search) | `npm test` | `npm run check`, `npm run eval` |
| [`pi-extensions/`](./pi-extensions) | `npm test` | `npm run validate` |

## Adding a new tool

See [Adding a new tool](./README.md#adding-a-new-tool) in the README, and copy an
existing tool's `AGENTS.md` as the starting point for the new one.

## Security

Do not report vulnerabilities in public issues. See [`SECURITY.md`](./SECURITY.md).
