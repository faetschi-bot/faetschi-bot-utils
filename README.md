# faetschi-bot-utils

Small, reusable utilities by [@faetschi-bot](https://github.com/faetschi-bot).

[![Last commit](https://img.shields.io/github/last-commit/faetschi-bot/faetschi-bot-utils?branch=main&label=last%20commit)](https://github.com/faetschi-bot/faetschi-bot-utils/commits/main)
[![License](https://img.shields.io/github/license/faetschi-bot/faetschi-bot-utils?color=blue)](./LICENSE)
[![Security policy](https://img.shields.io/badge/security-policy-blue.svg)](./SECURITY.md)
[![Contributing](https://img.shields.io/badge/contributing-guide-blue.svg)](./CONTRIBUTING.md)
[![Open issues](https://img.shields.io/github/issues/faetschi-bot/faetschi-bot-utils)](https://github.com/faetschi-bot/faetschi-bot-utils/issues)
[![Stars](https://img.shields.io/github/stars/faetschi-bot/faetschi-bot-utils?color=eac54f)](https://github.com/faetschi-bot/faetschi-bot-utils/stargazers)

> **Using an AI coding agent?** Start at [`AGENTS.md`](./AGENTS.md), which links
> each tool's own agent guide.

## Tools

Each tool is versioned and released independently. The badges link to that
tool's CI runs and release history, so the table doubles as a status board:

| Utility | Description | CI | Version |
|---------|-------------|:--:|:-------:|
| [`📸 visual-shot`](./visual-shot) | Reproducible headless-Chromium screenshots for PR review, with no-root provisioning | [![visual-shot CI](https://img.shields.io/github/actions/workflow/status/faetschi-bot/faetschi-bot-utils/ci-visual-shot.yml?branch=main&label=)](https://github.com/faetschi-bot/faetschi-bot-utils/actions/workflows/ci-visual-shot.yml) | [![visual-shot version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffaetschi-bot%2Ffaetschi-bot-utils%2Fmain%2Fvisual-shot%2Fpackage.json&query=%24.version&label=&color=blue)](https://github.com/faetschi-bot/faetschi-bot-utils/releases?q=visual-shot) |
| [`📦 outbound`](./outbound) | Clean, PR-based release changelogs: verify release hygiene and scaffold GitHub release categories | [![outbound CI](https://img.shields.io/github/actions/workflow/status/faetschi-bot/faetschi-bot-utils/ci-outbound.yml?branch=main&label=)](https://github.com/faetschi-bot/faetschi-bot-utils/actions/workflows/ci-outbound.yml) | [![outbound version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffaetschi-bot%2Ffaetschi-bot-utils%2Fmain%2Foutbound%2Fpackage.json&query=%24.version&label=&color=blue)](https://github.com/faetschi-bot/faetschi-bot-utils/releases?q=outbound) |
| [`🛠️ agentic-tools`](./agentic-tools) | Reusable skills and hooks for AI coding agents | [![agentic-tools CI](https://img.shields.io/github/actions/workflow/status/faetschi-bot/faetschi-bot-utils/ci-agentic-tools.yml?branch=main&label=)](https://github.com/faetschi-bot/faetschi-bot-utils/actions/workflows/ci-agentic-tools.yml) | [![agentic-tools version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffaetschi-bot%2Ffaetschi-bot-utils%2Fmain%2Fagentic-tools%2Fpackage.json&query=%24.version&label=&color=blue)](https://github.com/faetschi-bot/faetschi-bot-utils/releases?q=agentic-tools) |
| [`💬 mention-agent`](./mention-agent) | Turn `@mentions` in issues and pull requests into AI agent runs — comment, or commit to the same PR | [![mention-agent CI](https://img.shields.io/github/actions/workflow/status/faetschi-bot/faetschi-bot-utils/ci-mention-agent.yml?branch=main&label=)](https://github.com/faetschi-bot/faetschi-bot-utils/actions/workflows/ci-mention-agent.yml) | [![mention-agent version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffaetschi-bot%2Ffaetschi-bot-utils%2Fmain%2Fmention-agent%2Fpackage.json&query=%24.version&label=&color=blue)](https://github.com/faetschi-bot/faetschi-bot-utils/releases?q=mention-agent) |
| [`🔎 session-search`](./session-search) | Lexical search over local AI coding-agent session history (OpenCode and Pi) | [![session-search CI](https://img.shields.io/github/actions/workflow/status/faetschi-bot/faetschi-bot-utils/ci-session-search.yml?branch=main&label=)](https://github.com/faetschi-bot/faetschi-bot-utils/actions/workflows/ci-session-search.yml) | [![session-search version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffaetschi-bot%2Ffaetschi-bot-utils%2Fmain%2Fsession-search%2Fpackage.json&query=%24.version&label=&color=blue)](https://github.com/faetschi-bot/faetschi-bot-utils/releases?q=session-search) |
| [`🧩 pi-extensions`](./pi-extensions) | Install a curated set of Pi and OMP extensions through each harness's own installer | [![pi-extensions CI](https://img.shields.io/github/actions/workflow/status/faetschi-bot/faetschi-bot-utils/ci-pi-extensions.yml?branch=main&label=)](https://github.com/faetschi-bot/faetschi-bot-utils/actions/workflows/ci-pi-extensions.yml) | [![pi-extensions version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffaetschi-bot%2Ffaetschi-bot-utils%2Fmain%2Fpi-extensions%2Fpackage.json&query=%24.version&label=&color=blue)](https://github.com/faetschi-bot/faetschi-bot-utils/releases?q=pi-extensions) |
| [`🔌 opencode-extensions`](./opencode-extensions) | Install a curated set of OpenCode plugins through OpenCode's own plugin manager | [![opencode-extensions CI](https://img.shields.io/github/actions/workflow/status/faetschi-bot/faetschi-bot-utils/ci-opencode-extensions.yml?branch=main&label=)](https://github.com/faetschi-bot/faetschi-bot-utils/actions/workflows/ci-opencode-extensions.yml) | [![opencode-extensions version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffaetschi-bot%2Ffaetschi-bot-utils%2Fmain%2Fopencode-extensions%2Fpackage.json&query=%24.version&label=&color=blue)](https://github.com/faetschi-bot/faetschi-bot-utils/releases?q=opencode-extensions) |

Each tool is self-contained. Tools are distributed as **GitHub Release
tarballs**, so installing or publishing them needs **no npm registry account and
no 2FA**. You can also vendor a folder or add the repo as a git submodule.

## Installing a tool

Each tool ships as a **GitHub Release tarball**, so no npm registry account or
login is needed. All tools require **Node 20+**.

Install the tool you need from its stable `-latest` URL, which always serves the
newest release:

| Tool | Install (per project) | First command |
|------|-----------------------|---------------|
| `visual-shot` | `npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-latest/visual-shot.tgz` | `npx visual-shot setup` |
| `outbound` | `npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/outbound-latest/outbound.tgz` | `npx outbound init` |
| `agentic-tools` | `npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/agentic-tools-latest/agentic-tools.tgz` | `npx agentic-tools list` |
| `mention-agent` | `npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/mention-agent-latest/mention-agent.tgz` | `npx mention-agent setup --mention @example-bot` |
| `session-search` | `npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/session-search-latest/session-search.tgz` | `npx session-search doctor --json` |
| `pi-extensions` | `npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/pi-extensions-latest/pi-extensions.tgz` | `npx pi-extensions doctor --json` |
| `opencode-extensions` | `npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/opencode-extensions-latest/opencode-extensions.tgz` | `npx opencode-extensions doctor --json` |

- **Per project:** run the install inside that project. `-D` records it in
  `devDependencies`, so it survives reinstalls and an agent can set it up too.
- **Every project:** use `npm i -g <url>` instead, then call the tool directly
  (`visual-shot setup`).
- **Pinning:** to lock an exact version instead of the moving `-latest`, use the
  versioned asset
  `.../releases/download/<tool>-v<version>/<tool>-<version>.tgz` from the
  [Releases](https://github.com/faetschi-bot/faetschi-bot-utils/releases) page.

### Verify an install

Every tool has a machine-readable check that exits non-zero when something is
wrong:

```bash
npx visual-shot doctor --json      # run `visual-shot setup` first
npx outbound doctor --json
npx agentic-tools doctor --json
```

### Without npm

Vendor the folder or add the repo as a submodule and call the tool by path:

```bash
# vendored copy
cp -r visual-shot /path/to/project/tools/visual-shot
node tools/visual-shot/bin/visual-shot.mjs setup

# git submodule (one shared copy across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
node tools/faetschi-bot-utils/visual-shot/bin/visual-shot.mjs setup
```

## Releasing a tool

Each tool is versioned and released independently. **Releases are automatic on
merge:** bump `"version"` in `<tool>/package.json`, commit, and merge to `main`.
The matching workflow (`.github/workflows/release-<tool>.yml`) resolves the
version, and if it has not been released yet, runs `npm pack` and creates the
`<tool>-v<version>` tag and GitHub Release. The same workflow then refreshes the
moving `<tool>-latest` release, whose stable `<tool>.tgz` asset backs the install
URLs above. Re-merging without a version bump is a no-op. Do not push tags by
hand.

To release a tool, bump its `<tool>/package.json` and merge:

```bash
# visual-shot    -> .../releases/tag/visual-shot-v<version>
# outbound       -> .../releases/tag/outbound-v<version>
# agentic-tools  -> .../releases/tag/agentic-tools-v<version>
# session-search -> .../releases/tag/session-search-v<version>
# pi-extensions  -> .../releases/tag/pi-extensions-v<version>
# opencode-extensions -> .../releases/tag/opencode-extensions-v<version>
```

## Adding a new tool

1. Create `<tool>/` with a `package.json` (`name`, `version`, `bin`, `files`,
   `license`, `engines`) and the tool's files. Keep it self-contained.
2. Copy an existing release workflow (e.g. `release-outbound.yml`) to
   `.github/workflows/release-<tool>.yml` and change the `working-directory`,
   the `<tool>/**` path filter, and the tag prefix to `<tool>`. Add a matching
   `ci-<tool>.yml` too.
3. Release by bumping `<tool>/package.json` and merging to `main` (see above).
