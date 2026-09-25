# faetschi-bot-utils

Small, reusable utilities by [@faetschi-bot](https://github.com/faetschi-bot).

| Utility | Description |
|---------|-------------|
| [`visual-shot/`](./visual-shot) | Reproducible headless-Chromium screenshots for PR review, with no-root provisioning. |
| [`outbound/`](./outbound) | Clean, PR-based release changelogs: verify release hygiene and scaffold GitHub release categories. |

Each tool is self-contained. Tools are distributed as **GitHub Release
tarballs**, so installing or publishing them needs **no npm registry account and
no 2FA**. You can also vendor a folder or add the repo as a git submodule.

## Installing a tool

Every tool is attached as a tarball to its release on this repo's
[Releases](https://github.com/faetschi-bot/faetschi-bot-utils/releases) page.
Install one straight from its URL:

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/<tool>-v<version>/<tool>-<version>.tgz
npx <tool> --help
```

For `visual-shot`:

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-v0.2.0/visual-shot-0.2.0.tgz
npx visual-shot setup
```

For `outbound`:

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/outbound-v0.1.0/outbound-0.1.0.tgz
npx outbound doctor --json
```

Prefer a local copy? Vendor the folder or add the repo as a submodule:

```bash
# vendored copy
cp -r visual-shot /path/to/project/tools/visual-shot

# git submodule (one shared copy across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

## Releasing a tool

Each tool is versioned and released independently. **Releases are automatic on
merge:** bump `"version"` in `<tool>/package.json`, commit, and merge to `main`.
The matching workflow (`.github/workflows/release-<tool>.yml`) resolves the
version, and if it has not been released yet, runs `npm pack` and creates the
`<tool>-v<version>` tag and GitHub Release. Re-merging without a version bump is
a no-op. Do not push tags by hand.

To release a tool, bump its `<tool>/package.json` and merge:

```bash
# visual-shot -> .../releases/tag/visual-shot-v<version>
# outbound    -> .../releases/tag/outbound-v<version>
```

## Adding a new tool

1. Create `<tool>/` with a `package.json` (`name`, `version`, `bin`, `files`,
   `license`, `engines`) and the tool's files. Keep it self-contained.
2. Copy an existing release workflow (`release-visual-shot.yml` or
   `release-outbound.yml`) to `.github/workflows/release-<tool>.yml` and change
   the `working-directory`, the `<tool>/**` path filter, and the tag prefix to
   `<tool>`. Add a matching `ci-<tool>.yml` too.
3. Release by bumping `<tool>/package.json` and merging to `main` (see above).
