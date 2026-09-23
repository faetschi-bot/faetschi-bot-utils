# visual-shot

Reproducible headless-Chromium screenshots and image diffs for pull requests.
One command opens your running app, drives it if needed, and writes a PNG you can
commit and embed in a PR — including on machines with **no root and no browser
installed**.

It is generic: point it at a URL, and it works for any web project. The heavy
assets (Chromium, missing shared libraries, the pinned Playwright package) live
in a **machine-global cache**, so several projects share one provision.

## Requirements

- **Node 20+** and `npm` (the host project's, or a global one).
- **Network** on first run (downloads Chromium + a few packages).
- **Linux** for the fully automatic no-root path. Debian/Ubuntu is handled out of
  the box; other distros and macOS/Windows need either root/admin
  (`npx playwright install-deps chromium`) or a system that already has the
  Chromium libraries. WebGL works headless via SwiftShader.

## Install

Install the released tarball (no npm registry account needed):

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-v0.3.0/visual-shot-0.3.0.tgz
npx visual-shot setup
```

Or vendor it from the
[`faetschi-bot-utils`](https://github.com/faetschi-bot/faetschi-bot-utils)
monorepo (`visual-shot/`):

```bash
# Vendored copy
cp -r visual-shot /path/to/project/tools/visual-shot
node tools/visual-shot/bin/visual-shot.mjs setup

# Git submodule (share one copy across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
node tools/faetschi-bot-utils/visual-shot/bin/visual-shot.mjs setup
```

Then start your app and capture:

```bash
npm run dev                                   # your app (default expects :5173)
npx visual-shot --name main-menu              # -> tmp/images/PRs/main-menu.png
npx visual-shot --name menu --wait-for .menu  # wait for a selector first
```

When vendored/submoduled, call the bin by path instead of `npx`:

```bash
node tools/visual-shot/bin/visual-shot.mjs --name main-menu
```

`setup` is optional: the first capture runs it automatically if the cache is
missing.

## CLI

```
visual-shot capture [options]        screenshot a URL to a PNG (default command)
visual-shot diff <before> <after>    compare two images and write a diff PNG
visual-shot setup                    provision Chromium + libraries, then exit
visual-shot doctor [--json]          check the environment, then exit
```

`visual-shot [options]` without a command is the same as `visual-shot capture`.
`doctor` reports Node, cache, Chromium, Playwright, Mermaid, and — when `--url` is
given — whether the dev server responds. It exits non-zero when a required check
fails, so an agent can verify setup before capturing.

### Capture options

| Flag | Meaning |
|------|---------|
| `--name <slug>` | output name, no extension (default `screenshot`) |
| `--out <path>` | explicit output path (overrides `--name` and `$VISUAL_OUT_DIR`) |
| `--url <url>` | page to open (default `$VISUAL_URL` or `http://127.0.0.1:5173/`) |
| `--viewport <WxH>` | viewport size (default `1280x720`) |
| `--scale <n>` | device scale factor (default `2`, i.e. retina) |
| `--device <name>` | Playwright device preset, e.g. `"iPhone 13"` |
| `--wait-for <sel>` | wait for a selector before capturing |
| `--wait <ms>` | extra settle time (default `1000`) |
| `--hover <sel>` / `--click <sel>` / `--key <key>` | drive the UI first (repeatable, in order) |
| `--element <sel>` | capture one element instead of the viewport |
| `--full-page` | capture the whole scrollable page |
| `--wait-for-server` | poll `--url` until it responds before navigating |
| `--server-timeout <ms>` | how long to wait for the server (default `30000`) |
| `--timeout <ms>` | navigation timeout (default `30000`) |
| `--retries <n>` | retry a failed capture `n` times (max `10`) |
| `--header <name:value>` | extra HTTP header (repeatable) |
| `--storage-state <path>` | Playwright storage state JSON (cookies/localStorage) |
| `--allow-console-error <pattern>` | ignore matching console errors (repeatable; substring, or regex if it compiles) |
| `--ignore-console` | ignore all console errors (page errors still fail) |
| `--json` | print a machine-readable result object |

The process exits non-zero if the page logs any console or page error, so a
broken build cannot silently produce a "good" screenshot. Use
`--allow-console-error` to whitelist benign dev noise (favicon 404s, HMR
warnings). With `--json`, the result is a stable object on success:

```json
{ "ok": true, "out": "/abs/path.png", "url": "http://127.0.0.1:5173/",
  "ignoredConsoleErrors": 0, "consoleErrors": [], "pageErrors": [], "truncated": false }
```

On a validation error (`ok: false` with `error`) or a capture failure, the same
`--json` flag yields `{ "ok": false, "error": "..." }` (plus `out`/`url` for a
capture failure) instead of human-readable stderr. `truncated` is `true` when a
page produced more than 50 errors and the lists were capped.

### Compare images (diff)

`diff` compares two images and writes a single side-by-side PNG
(`before | after | diff`, differing pixels highlighted red). Each input is a
local image path or an `http(s)://` URL; **URLs are captured as page screenshots
at `--viewport`, not downloaded as images**.

```bash
npx visual-shot diff before.png after.png --out tmp/images/PRs/change.png
npx visual-shot diff http://localhost:3000/ after.png --fail-on-diff
```

| Flag | Meaning |
|------|---------|
| `--out <path>` | output PNG (default `$VISUAL_OUT_DIR/diff.png`) |
| `--threshold <n>` | per-pixel color distance threshold, `0`–`1` (default `0.1`) |
| `--viewport <WxH>` / `--scale <n>` | capture settings for URL inputs (default `1280x720`, scale `1`) |
| `--fail-on-diff` | exit `1` when any differing pixels are found |
| `--json` | print `{ ok, out, changedPixels, totalPixels, diffPercentage, sizeMatch, … }` |

By default `diff` exits `0` and just reports; add `--fail-on-diff` to use it as a
visual-regression gate, in which case `--json` reports `ok: false` when pixels
differ (and the process exits `1`). Differing input dimensions are padded to the
common max size and reported via `sizeMatch: false`.

## Environment variables

| Variable | Meaning |
|----------|---------|
| `VISUAL_URL` | default page URL |
| `VISUAL_OUT_DIR` | default output directory (default `tmp/images/PRs`) |
| `VISUAL_SHOT_CACHE` | persistent cache dir (default `$XDG_DATA_HOME/visual-shot`, i.e. `~/.local/share/visual-shot`) |
| `VISUAL_SHOT_PLAYWRIGHT_VERSION` | pinned Playwright version (default `1.49.1`) |

## How it works

```
$VISUAL_SHOT_CACHE/
  browsers/   Chromium            (PLAYWRIGHT_BROWSERS_PATH)
  sysroot/    unpacked .debs      (missing libs + fonts, no root)
  pw/         pinned playwright   (self-provisioned if not installed)
  env.sh, fonts.conf, .provisioned
```

- `scripts/provision.sh` installs a pinned Playwright into the cache, downloads
  Chromium there, and checks its shared libraries with `ldd`.
- If libraries are missing and there is no root, `scripts/provision-sysroot.sh`
  runs `apt-get download` against a throwaway apt state dir and unpacks the
  dependency closure into `sysroot/` (including fonts, which bare containers
  lack). Nothing is installed system-wide.
- The CLI loads `env.sh` (`LD_LIBRARY_PATH`, `FONTCONFIG_*`,
  `PLAYWRIGHT_BROWSERS_PATH`) and launches Chromium with SwiftShader for
  software WebGL.

Because the cache is machine-global, provisioning once covers every project on
that machine.

## Using it for PRs

1. Capture: `npx visual-shot --name my-feature` (writes to `tmp/images/PRs/`).
2. Commit the PNG.
3. Reference its raw URL in the PR body:

   ```markdown
   ![my feature](https://github.com/<owner>/<repo>/blob/<branch>/tmp/images/PRs/my-feature.png?raw=true)
   ```

Add `tmp/images/PRs/` to version control and keep other scratch files ignored,
for example:

```gitignore
tmp/*
!tmp/images/
tmp/images/*
!tmp/images/PRs/
```

## Playwright MCP

`@playwright/mcp` lets an agent drive a browser interactively. It is the same
Playwright engine, so it does **not** remove the browser/sysroot requirement —
MCP changes who drives the browser, not where it lives. Recommended: keep
`visual-shot` as the deterministic, CI-reusable source of truth, and optionally
register the MCP with the same cache paths for ad-hoc exploration.

## Releasing

Releases are GitHub Release tarballs — no npm registry account or 2FA involved.
**Releases are automatic on merge:** bump `"version"` in
`visual-shot/package.json`, commit, and merge to `main`. The
`Release visual-shot` workflow
(`.github/workflows/release-visual-shot.yml`) sees the new version, packs the
tarball, and creates the `visual-shot-v<version>` tag and GitHub Release. If the
version was already released, the workflow is a no-op. You do not push tags by
hand.

Consumers then install it by URL:

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-v0.3.0/visual-shot-0.3.0.tgz
npx visual-shot setup
```

## Agents and CI

- [`AGENTS.md`](./AGENTS.md) is the canonical bootstrap recipe for AI agents:
  permissions, install, `doctor --json` verification, dev-server discovery, and
  the `--json` result contract.
- A composite GitHub Action is available at `visual-shot/action.yml`. Use it from
  another repository:

  ```yaml
  - uses: faetschi-bot/faetschi-bot-utils/visual-shot@main
    with:
      args: --url http://127.0.0.1:3000/ --name my-feature --json
  ```

## Troubleshooting

- **`playwright not found`** — run `visual-shot setup`. The CLI also resolves a
  `playwright` already installed in the host project's `node_modules`, but for a
  vendored copy outside the project tree rely on `setup`.
- **Blank/zero-width text in the screenshot** — fonts are missing; re-run
  `visual-shot setup` so the sysroot font packages are unpacked.
- **`Executable doesn't exist`** — the browser download was interrupted; delete
  `$VISUAL_SHOT_CACHE/browsers` and re-run setup.
- **Missing libraries on a non-Debian host** — run
  `npx playwright install-deps chromium` (needs root/admin).
- **App not reachable** — start the dev server first, or pass `--url`.
