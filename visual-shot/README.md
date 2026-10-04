# visual-shot

Reproducible headless-Chromium visual artifacts for pull requests: screenshots,
image diffs, terminal captures, Mermaid diagrams, and visual recaps. One command
opens your running app (or renders a file) and writes a PNG — or a
self-contained HTML report — you can commit and embed in a PR, including on
machines with **no root and no browser installed**.

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
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-latest/visual-shot.tgz
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
visual-shot term -- <command...>     render a command's output as a PNG
visual-shot diagram <input>          render Mermaid diagrams to PNG or SVG
visual-shot recap --from <json>      render a visual recap to HTML/Markdown (and PNG)
visual-shot setup                    provision Chromium + libraries, then exit
visual-shot doctor [--json]          check the environment, then exit
```

`visual-shot [options]` without a command is the same as `visual-shot capture`.
`doctor` reports Node, cache, Chromium, Playwright, Mermaid, highlight.js, and —
when `--url` is given — whether the dev server responds. It exits non-zero when a
required check fails, so an agent can verify setup before capturing.

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
(`before | after`) — a clean before/after for PRs, with no highlighted diff
overlay — and reports how many pixels changed. The `before` panel is outlined in
red and the `after` panel in green, for quick visual distinction. Each input is a
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

### Render terminal output (term)

`term` runs a command, captures its stdout/stderr (ANSI colors preserved), and
renders it as a terminal-style PNG — handy for pasting a test or build transcript
into a PR. Everything after `--` is the command; without `--`, the first
non-option token starts the command.

```bash
npx visual-shot term --title "npm test" -- npm test
npx visual-shot term --shell "pytest -q 2>&1 | tail -20"
npx visual-shot term --fail-on-error -- npm run build   # exit 1 if the command fails
```

| Flag | Meaning |
|------|---------|
| `--out <path>` | output PNG (default `$VISUAL_OUT_DIR/term.png`) |
| `--title <text>` | render a title bar above the output |
| `--width <px>` / `--font-size <px>` | layout (defaults `900` / `13`) |
| `--max-lines <n>` | cap rendered lines (default `2000`); truncation is reported |
| `--timeout <ms>` | kill the command after this (default `120000`) |
| `--shell "<string>"` | run a single command string through the shell |
| `--fail-on-error` | exit `1` when the command exits non-zero or times out |
| `--json` | print `{ ok, out, command, shell, exitCode, signal, timedOut, lines, truncated, bufferTruncated, durationMs }` |

By default `term` writes the image and exits `0` even if the command failed (the
failure is shown in the image); use `--fail-on-error` to propagate it (with
`--json` it then reports `ok: false`). stdout and stderr are captured through
separate pipes, so their relative ordering in the image is approximate rather
than a faithful interleave. Carriage returns are rendered with terminal
overwrite semantics: each `\r`-separated segment is painted from column 0,
preserving any longer tail (so `hello\rhi` renders as `hillo` and `foo\r` as
`foo`). `bufferTruncated: true` means the captured output exceeded 8 MiB and was
cut off.

### Render Mermaid diagrams (diagram)

`diagram` renders Mermaid to PNG or SVG — useful for PR diagrams and for LaTeX
figures that need real image files. It accepts a `.mmd` file, a Markdown file
(renders top-level fenced ` ```mermaid ` blocks; a 4-space-indented block or
mermaid text nested inside another fence is skipped), or `-` for stdin.

```bash
npx visual-shot diagram docs/flow.mmd --out tmp/images/PRs/flow.png
npx visual-shot diagram docs/design.md --format svg --out tmp/images/PRs/design/
npx visual-shot diagram docs/design.md --md-out docs/design.rendered.md
```

| Flag | Meaning |
|------|---------|
| `--out <path>` | output file (`.mmd`) or directory (`.md`) |
| `--format <png\|svg>` | output format (default `png`) |
| `--theme <name>` | Mermaid theme (`default`, `dark`, `neutral`, `forest`) |
| `--background <color>` | background colour (default `transparent`, for PNG and SVG alike) |
| `--scale <n>` | device scale factor for PNG (default `2`) |
| `--md-out <file>` | for Markdown input, write a copy with fences replaced by image links |
| `--json` | print `{ ok, format, mermaidVersion, outputs, mdOut? }` |

Mermaid itself is **not** an npm dependency: a pinned `mermaid.min.js` is
downloaded once into the cache (`$VISUAL_SHOT_CACHE/mermaid/`) on first use, so
later renders work offline. Override the pin with `VISUAL_SHOT_MERMAID_VERSION`.

### Render a visual recap (recap)

`recap` turns a diff into a self-contained HTML report — file map, annotated
diffs, diagrams, schema/API summaries, real before/after screenshots, and review
notes — and optionally a PNG of the whole report. It renders a structured
`recap.json` and can fold in a git diff for the mechanical parts. With
`--format gfm` the same input is emitted as a GitHub-flavoured Markdown comment
instead, which is usually more useful in a PR than a screenshot.

```bash
# From an agent-authored recap.json (self-contained HTML + PNG)
npx visual-shot recap --from recap.json --out tmp/images/PRs/recap.html --png

# From a git range only (file map + raw patches)
npx visual-shot recap --diff main...HEAD --out tmp/images/PRs/recap.html --png --json

# Combine both: the JSON supplies the rich blocks, --diff appends the patches
npx visual-shot recap --from recap.json --diff main...HEAD --png

# A GitHub comment instead of an HTML report (no browser, no provisioning)
npx visual-shot recap --from recap.json --format gfm --out recap.md
```

| Flag | Meaning |
|------|---------|
| `--from <file\|->` | recap JSON to render (`-` reads stdin) |
| `--diff <range>` | git range (e.g. `main...HEAD`) to add a file map + patches |
| `--repo <dir>` | repository for `--diff` (default: cwd) |
| `--asset-root <dir>` | root confining local image reads (default: the `--from` file's directory, else cwd) |
| `--format <html\|gfm>` | `html` (default) writes a self-contained report; `gfm` writes a GitHub Markdown comment |
| `--out <path>` | output file (default `$VISUAL_OUT_DIR/recap.html` for html, `$VISUAL_OUT_DIR/recap.md` for gfm) |
| `--png` / `--png-out <path>` | also write a PNG of the report (the PNG reveals every tab panel; the HTML keeps interactive tabs). In gfm mode a PNG is written only when `--png` is passed |
| `--report-url <url>` | gfm: link to the rendered HTML report |
| `--image-url <url>` | gfm: embed an image of the report (defaults to the PNG's local path when `--png` wrote one — pass an explicit URL for a working PR-comment image) |
| `--title <text>` | override the recap title |
| `--theme <light\|dark>` | report theme (default `dark`) |
| `--width <px>` / `--scale <n>` | page width, `320`–`4000` / PNG scale, `1`–`4` (defaults `1100` / `2`) |
| `--no-highlight` | skip highlight.js (code stays uncolored) |
| `--json` | print `{ ok, format, html\|markdown, png, theme, blocks, mermaid, highlight, warnings }` |

The HTML is the primary artifact and is **self-contained**: local images are
inlined as data URIs, and Mermaid SVG + syntax highlighting are baked into the
markup, so it opens offline. The HTML-only path (no `--png`, no Mermaid, no
code blocks) does not need Chromium at all. Syntax highlighting and Mermaid are
pinned assets fetched into the cache on first use, like `diagram`; set
`VISUAL_SHOT_HIGHLIGHT_VERSION` / `VISUAL_SHOT_MERMAID_VERSION` to repin.

`--png` screenshots the whole report with every tab panel revealed
(`TABS_PRINT_CSS`) and every collapsed JSON `<details>` opened; the saved HTML
keeps its interactive tabs and the author's `collapsedDepth`.

#### GitHub Markdown output (`--format gfm`)

`--format gfm` renders the same `recap.json` (and `--diff`) as a GitHub comment.
It needs no browser: the output is plain Markdown plus the structural tags GitHub
renders natively, so it does not provision or launch Chromium unless `--png` is
also passed. The block mapping is:

| Block | GFM output |
|-------|------------|
| `notes` | the Markdown as-is |
| `callout` | a blockquote, with the tone in italics and the title in bold |
| `file-tree` | a table with an `A`/`M`/`D`/`R` badge column (an unknown change value falls back to `M`) |
| `diff` | `<details>` + a ` ```diff ` fence (built from `before`/`after`) + annotation bullets |
| `patch` | `<details>` + a ` ```diff ` fence with the raw git patch (or `_No textual changes._` when empty) |
| `code` / `annotated-code` | `<details>` + a language-tagged fence + annotation bullets |
| `mermaid` | a ` ```mermaid ` fence (GitHub renders Mermaid natively) + caption |
| `json` | `<details>` + a pretty-printed ` ```json ` fence |
| `table` | a Markdown table |
| `checklist` | `- [x]` / `- [ ]` items |
| `data-model` | `### {name}` + a `Field \| Type \| Keys \| Change` table, plus relations |
| `api-endpoint` | an `### METHOD path` heading + params and responses tables (diff-aware) |
| `image` / `image-pair` | `![]()` embeds whose destinations are angle-bracketed and percent-encoded (a two-column table for a pair) |
| `columns` / `tabs` | each label as bold text, then its blocks (tabs flatten, like the PNG) |
| `diagram` / `wireframe` | an italic placeholder with the caption — their live HTML cannot render in a comment |

Table cells escape `\|` and turn newlines into `<br>`; code fences grow past any
backtick run in the content; link/image destinations are wrapped in angle
brackets with `<`/`>` percent-encoded, so a URL with `)`, spaces, or parens
cannot break out. Prose and inline fields may contain Markdown (`` `code` ``,
`**bold**`, links) but their `<`/`>` are neutralised (`&lt;`/`&gt;`), so no JSON
value can inject an HTML tag; only `<details>`, `<summary>`, and `<br>` are ever
emitted structurally by the renderer. Text inside fenced code blocks (`diff`,
`patch`, `code`, `annotated-code`, `json`, `mermaid`) is passed through
literally.

The output always begins with the sticky marker `<!-- visual-shot-recap -->`, so
a workflow can find and update its own comment instead of posting a new one.

#### Posting a recap to a PR

Render the comment (and optionally a committed PNG) with `--format gfm`, then
upsert a single comment keyed on the marker. For example:

```yaml
- uses: faetschi-bot/faetschi-bot-utils/visual-shot@main
  with:
    args: --from recap.json --format gfm --report-url ${{ steps.pages.outputs.url }} --out recap.md --json

- uses: peter-evans/find-comment@v3
  id: find
  with:
    issue-number: ${{ github.event.pull_request.number }}
    body-includes: '<!-- visual-shot-recap -->'

- uses: peter-evans/create-or-update-comment@v4
  with:
    issue-number: ${{ github.event.pull_request.number }}
    comment-id: ${{ steps.find.outputs.comment-id }}
    body-path: recap.md
    edit-mode: replace
```

`find-comment` locates the previous recap by its hidden marker and returns its
`comment-id`; `create-or-update-comment` updates that comment in place (and
creates a new one when `comment-id` is empty). Without those actions, `gh`
works the same way but you must find the previous comment yourself:

```bash
id=$(gh pr view "$PR" --json comments --jq '.comments[] | select(.body | contains("<!-- visual-shot-recap -->")) | .id')
if [ -n "$id" ]; then gh api -X PATCH "repos/$REPO/issues/comments/$id" -f body=@"recap.md"; \
else gh pr comment "$PR" --body-file recap.md; fi
```

GitHub renders ` ```mermaid ` fences and `<details>` blocks natively, so a recap
comment is interactive without a screenshot. The two exceptions are `diagram`
and `wireframe`, whose author HTML/CSS cannot run in a comment — the renderer
emits their caption as a placeholder and, with `--report-url`, links the rendered
report. Pass `--png` (and commit the PNG) plus `--image-url` to embed a static
image of the whole report alongside the comment. With `--format gfm --png` and
no `--image-url`, the PNG is referenced by its local path — fine when the image
is committed next to the comment body, but pass `--image-url` with the raw or
rendered URL for an image that actually loads in a PR comment.

#### Render trust boundaries

The recap JSON is **untrusted input**, so the renderer enforces a few limits:

- `diagram` blocks embed author-supplied `html`/`css` verbatim and run as HTML in
  the artifact. Treat that content as trusted author content and never
  interpolate diff text into it.
- `wireframe` author `html`/`css` renders in a `sandbox` iframe (`srcdoc`), so it
  is isolated from the report and other wireframes and scripts are disabled; it
  is still trusted author content, so never interpolate diff text into it.
- Local `image`/`image-pair` sources are confined to `--asset-root` (the
  `--from` file's directory by default). Only regular files with an allowlisted
  image extension and at most `MAX_RECAP_IMAGE_BYTES` (10 MiB) are inlined;
  anything else is dropped with a warning and renders as "image not found".
- Remote `https:` image URLs are left as-is and are **fetched when the artifact
  is opened**, so a report containing them is not strictly offline.
- The written file carries a CSP (`RECAP_CSP`) that blocks scripts and external
  egress, and the render pass itself only loads inline (`data:`), local
  (`file:`), and about: URLs — a crafted `diagram` or markdown `<img>` cannot
  beacon or SSRF while `recap` renders.
- `--width` / `--scale` are bounded (`320`–`4000` / `1`–`4`) and a `--from` file
  is capped at `MAX_RECAP_SOURCE_BYTES` (8 MiB); out-of-range values fail with
  exit 2.

`recap.json` is a small, versioned contract: `{ version: 1, title, brief?, meta?,
blocks: [...] }`. Block types: `file-tree`, `diff`, `patch`, `image`,
`image-pair`, `mermaid`, `diagram`, `wireframe`, `data-model`, `api-endpoint`,
`callout`, `table`, `checklist`, `notes`, `code`, `annotated-code`, `json`, and
the `columns` / `tabs` containers. Inspect the schema and validation errors from
[`lib/recap/schema.mjs`](./lib/recap/schema.mjs); an agent authors this JSON by
following the companion **`visual-recap`** skill in
[`agentic-tools`](../agentic-tools). For a rendered showcase (source JSON, an
interactive HTML report, and light/dark PNGs), see
[`examples/recap/`](https://github.com/faetschi-bot/faetschi-bot-utils/tree/main/visual-shot/examples/recap)
in the repository.

`wireframe` renders a framed UI mockup from author `html` (optional `css`,
`caption`, `height`), for showing UI/state changes when a real screenshot is
unavailable or for annotated mockups. `surface` selects the frame chrome and
width: `browser` (default), `desktop`, `tablet`, `mobile`, `popover`, or `panel`;
`height` overrides the per-surface body height in px (a positive integer, at most
`2000`). The body renders in a `sandbox` iframe via `srcdoc`, so author
`html`/`css` is isolated to that one mockup — it cannot restyle the report or a
sibling wireframe — and scripts are disabled. Compose a before/after by placing
two `wireframe` blocks inside one `columns` block.

Wireframe author `css` and inline styles are **not** themed: the iframe starts
from a light base (`background:#fff; color:#1f2328`). Keep mockup colors
self-contained and readable on a light background, or make them theme-aware
yourself, so they stay legible when the report is dark.

`json` renders any JSON value as a collapsible tree:
`{ type: "json", data: <any JSON>, title?, collapsedDepth? }`. Use it to show an
API request/response payload, a config object, or event data inline instead of
pasting a code block. `data` is required and may be any JSON value — including
`null`, `false`, `0`, or `""`. Objects show `{N keys}` and arrays `[N items]`;
nested nodes collapse with native `<details>`/`<summary>`. Every key and value is
escaped, so untrusted diff text is safe. `collapsedDepth` (a non-negative
integer, at most `50`) sets how deep nodes start expanded; omit it to expand
everything, which is what a `--png` screenshot needs.

`api-endpoint` fields are diff-aware so a recap can show a contract changing,
not just its new shape. The endpoint root accepts `change`
(`added`/`removed`/`modified`/`renamed`), rendered as a badge beside the
method/path; a `removed` endpoint is outlined red with its path struck through.
Each `params[]` and `responses[]` entry accepts the same `change` plus a `was`
string holding the previous name/status, rendered as a badge and a muted
`(was <value>)` after the name/status. All values are escaped.

## Environment variables

| Variable | Meaning |
|----------|---------|
| `VISUAL_URL` | default page URL |
| `VISUAL_OUT_DIR` | default output directory (default `tmp/images/PRs`) |
| `VISUAL_SHOT_CACHE` | persistent cache dir (default `$XDG_DATA_HOME/visual-shot`, i.e. `~/.local/share/visual-shot`) |
| `VISUAL_SHOT_PLAYWRIGHT_VERSION` | pinned Playwright version (default `1.49.1`) |
| `VISUAL_SHOT_MERMAID_VERSION` | pinned Mermaid version for `diagram`/`recap` (default `11.4.1`) |
| `VISUAL_SHOT_HIGHLIGHT_VERSION` | pinned highlight.js version for `recap` (default `11.10.0`) |

## How it works

```
$VISUAL_SHOT_CACHE/
  browsers/   Chromium            (PLAYWRIGHT_BROWSERS_PATH)
  sysroot/    unpacked .debs      (missing libs + fonts, no root)
  pw/         pinned playwright   (self-provisioned if not installed)
  mermaid/    pinned mermaid.min.js (diagram/recap, fetched on first use)
  highlight/  pinned highlight.js   (recap, fetched on first use)
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
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-latest/visual-shot.tgz
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
