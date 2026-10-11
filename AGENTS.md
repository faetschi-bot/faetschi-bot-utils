# AGENTS.md

Instructions for AI agents using this repository. If you are an agent and a user
pointed you here to take screenshots of **their** project, read this file first.

`faetschi-bot-utils` is a monorepo of small, self-contained tools. Each tool has
its own `AGENTS.md` next to it — start there.

| Tool | Agent guide |
|------|-------------|
| [`visual-shot/`](./visual-shot) | [`visual-shot/AGENTS.md`](./visual-shot/AGENTS.md) |
| [`outbound/`](./outbound) | [`outbound/AGENTS.md`](./outbound/AGENTS.md) |
| [`agentic-tools/`](./agentic-tools) | [`agentic-tools/AGENTS.md`](./agentic-tools/AGENTS.md) |
| [`mention-agent/`](./mention-agent) | [`mention-agent/AGENTS.md`](./mention-agent/AGENTS.md) |
| [`session-search/`](./session-search) | [`session-search/AGENTS.md`](./session-search/AGENTS.md) |
| [`pi-collection/`](./pi-collection) | [`pi-collection/AGENTS.md`](./pi-collection/AGENTS.md) |
| [`opencode-collection/`](./opencode-collection) | [`opencode-collection/AGENTS.md`](./opencode-collection/AGENTS.md) |

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
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-latest/visual-shot.tgz
npx visual-shot doctor --json

# outbound
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/outbound-latest/outbound.tgz
npx outbound doctor --json

# agentic-tools
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/agentic-tools-latest/agentic-tools.tgz
npx agentic-tools doctor --json
npx agentic-tools install --all                 # copy the skills into .opencode/skills/
npx agentic-tools install catch-up --commands   # copy one slash command (--target pi|codex|opencode)

# mention-agent
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/mention-agent-latest/mention-agent.tgz
npx mention-agent setup --mention @example-bot
npx mention-agent doctor --json

# session-search
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/session-search-latest/session-search.tgz
npx session-search doctor --json

# pi-collection
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/pi-collection-latest/pi-collection.tgz
npx pi-collection doctor --json
npx pi-collection install --all   # install for the pi/omp CLIs found on PATH

# opencode-collection
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/opencode-collection-latest/opencode-collection.tgz
npx opencode-collection doctor --json
npx opencode-collection install --all   # install the curated OpenCode plugins
```
