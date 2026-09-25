# faetschi-bot-utils

Small, reusable utilities by [@faetschi-bot](https://github.com/faetschi-bot).

| Utility | Description |
|---------|-------------|
| [`visual-shot/`](./visual-shot) | Reproducible headless-Chromium screenshots for PR review, with no-root provisioning. |
| [`outbound/`](./outbound) | Clean, PR-based release changelogs: verify release hygiene and scaffold GitHub release categories. |
| [`agentic-tools/`](./agentic-tools) | Reusable skills and hooks for AI coding agents (first skill: `test-audit`). |

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
```

## Adding a new tool

1. Create `<tool>/` with a `package.json` (`name`, `version`, `bin`, `files`,
   `license`, `engines`) and the tool's files. Keep it self-contained.
2. Copy an existing release workflow (e.g. `release-outbound.yml`) to
   `.github/workflows/release-<tool>.yml` and change the `working-directory`,
   the `<tool>/**` path filter, and the tag prefix to `<tool>`. Add a matching
   `ci-<tool>.yml` too.
3. Release by bumping `<tool>/package.json` and merging to `main` (see above).
