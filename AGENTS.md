# AGENTS.md

Instructions for AI agents using this repository. If you are an agent and a user
pointed you here to take screenshots of **their** project, read this file first.

`faetschi-bot-utils` is a monorepo of small, self-contained tools. Each tool has
its own `AGENTS.md` next to it — start there.

| Tool | Agent guide |
|------|-------------|
| [`visual-shot/`](./visual-shot) | [`visual-shot/AGENTS.md`](./visual-shot/AGENTS.md) |
| [`agentic-tools/`](./agentic-tools) | [`agentic-tools/AGENTS.md`](./agentic-tools/AGENTS.md) |

## Golden rules

- **Read-only access to this repo is enough.** Never commit here unless asked.
  You install a tool into the *target* project, or run it from a URL/vendored
  copy; you do not modify this repo.
- **Do not guess a tool's behavior from source.** Every tool ships an `AGENTS.md`
  and a `--help`; prefer those.
- **Verify, don't assume.** Tools expose a `doctor --json` (or equivalent) check;
  run it before reporting success.
- **Releases are automated.** Merging a version bump to `main` publishes a GitHub
  Release tarball automatically. Do not push tags by hand unless asked.

## Installing a tool into a project

Tools are distributed as GitHub Release tarballs (no npm registry account). The
canonical recipe lives in each tool's `AGENTS.md`.

```bash
# visual-shot
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-v0.2.0/visual-shot-0.2.0.tgz
npx visual-shot doctor --json

# agentic-tools
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/agentic-tools-v0.1.0/agentic-tools-0.1.0.tgz
npx agentic-tools doctor --json
```
