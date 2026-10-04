# visual-shot — agent guide

Reproducible headless-Chromium visual artifacts for PR review: screenshots,
image diffs, terminal captures, Mermaid diagrams, and visual recaps. Point it at
a running web app (any language, any framework) or a file and it writes a PNG/SVG
(or a self-contained HTML report). This file is the canonical recipe; prefer it
and `visual-shot --help` over reading the source.

## What an agent needs

| Capability | Why |
|------------|-----|
| Read access to this repo (or the release tarball) | To install the tool. |
| Write access to the **target** project | To install and to write the PNG. |
| Node 20+ and `npm` | Required runtime. |
| Network (first run only) | Downloads Playwright + Chromium into a global cache. |
| `bash` | `setup` runs provisioning scripts. |
| Ability to start the target app's dev server | The tool only opens a URL; it does not start your app. |

On Linux/Debian, provisioning is fully automatic with **no root**. On macOS,
Windows, and non-Debian Linux, `setup` needs root once
(`npx playwright install-deps chromium`) or a system that already has the
Chromium libraries. If you cannot get root, stop and tell the user.

## Bootstrap (pick one)

```bash
# A. Release tarball (recommended)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-latest/visual-shot.tgz

# B. Vendored copy
cp -r visual-shot /path/to/project/tools/visual-shot

# C. Git submodule (one copy shared across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

`setup` is optional: the first capture provisions automatically. To do it up
front (and fail fast):

```bash
npx visual-shot setup                                  # tarball install
node tools/visual-shot/bin/visual-shot.mjs setup       # vendored copy
node tools/faetschi-bot-utils/visual-shot/bin/visual-shot.mjs setup   # submodule
```

## Verify before reporting success

Always run the machine-readable check and require `"ok": true`:

```bash
npx visual-shot doctor --json --url "$APP_URL"
```

`doctor` reports Node, cache, Chromium, Playwright, and (if `--url` is given)
whether the dev server responds. It exits non-zero when not ready. Do **not**
claim success without a passing `doctor`.

## Find the dev server

`visual-shot` does not know your app's port. Determine it from the project
(README, `package.json` scripts, framework default, running-process output) and
pass it explicitly. Common defaults: Vite `5173`, Next/CRA `3000`, Django/Flask
`8000`, Rails `3000`, Go/Express often `8080`.

If the app is not running yet, start it, then wait for it with
`--wait-for-server` instead of sleeping:

```bash
npx visual-shot --url http://127.0.0.1:8080/ --wait-for-server --json --name my-feature
```

## Capture

```bash
# Viewport screenshot to tmp/images/PRs/<name>.png
npx visual-shot --url http://127.0.0.1:8080/ --name my-feature

# Wait for content, then capture one element
npx visual-shot --url http://127.0.0.1:8080/ --wait-for .dashboard --element .dashboard --name dashboard

# Drive the UI first, then capture (in order)
npx visual-shot --url http://127.0.0.1:8080/ --click "#menu" --hover ".item" --key Enter --name menu-open
```

Useful flags: `--full-page`, `--viewport WxH`, `--scale n`, `--device "iPhone 13"`,
`--header "Authorization: Bearer …"`, `--storage-state auth.json`,
`--retries 2`, `--timeout 60000`.

### The error gate (important)

By default the process exits non-zero if the page logs **any** console or page
error, so a broken build cannot silently produce a "good" screenshot. Benign dev
noise (favicon 404s, HMR warnings) will therefore fail the run. Whitelist it
narrowly rather than ignoring everything:

```bash
npx visual-shot --url "$APP_URL" --allow-console-error 'favicon' --name x
```

## Compare two images (diff)

`visual-shot diff <before> <after>` writes a side-by-side PNG (`before | after`) —
a clean before/after composite, not a highlighted diff — and reports how much
changed. The `before` panel is outlined red and the `after` panel green. Inputs
are local image paths or `http(s)://` URLs. Use it to show a reviewer *what
changed*, not just the new state:

```bash
npx visual-shot diff tmp/images/PRs/before.png tmp/images/PRs/after.png \
  --out tmp/images/PRs/change.png --json
```

- `--threshold <0..1>` per-pixel color tolerance (default `0.1`).
- `--fail-on-diff` exits `1` when anything changed (visual-regression gate); with
  `--json` it also reports `ok: false`.
- `--json` returns `{ ok, out, changedPixels, totalPixels, diffPercentage, sizeMatch }`.
- URL inputs are captured as page screenshots at `--viewport`, not downloaded.

Differing input dimensions are padded to the common max size and reported as
`sizeMatch: false` rather than failing.

## Render terminal output (term)

`visual-shot term -- <command...>` runs a command and renders its ANSI output as
a terminal-style PNG, for pasting a test/build transcript into a PR:

```bash
npx visual-shot term --title "npm test" -- npm test
npx visual-shot term --fail-on-error --json -- npm run build
```

Everything after `--` is the command (without `--`, the first non-option token
starts it). `--shell "<string>"` runs a shell string. `--fail-on-error` exits `1`
when the command fails; by default the image is written and exit is `0`. With
`--json`, `--fail-on-error` also sets `ok: false` when the command fails.

## Render Mermaid diagrams (diagram)

`visual-shot diagram <input>` renders Mermaid to PNG or SVG. Input is a `.mmd`
file, a Markdown file (renders top-level fenced ` ```mermaid ` blocks; a
4-space-indented block or mermaid text nested inside another fence is skipped),
or `-` for stdin:

```bash
npx visual-shot diagram docs/flow.mmd --out tmp/images/PRs/flow.png
npx visual-shot diagram docs/design.md --format svg --out tmp/images/PRs/design/ --json
```

PNG output is transparent by default (`--background <color>` paints a solid
background). A pinned `mermaid.min.js` is fetched once into
`$VISUAL_SHOT_CACHE/mermaid/` on first use (network required only then).
`doctor` reports it as an optional check. `--md-out <file>` rewrites a Markdown
copy with image links, each written as `![diagram](<relative/path>)`.

## Render a visual recap (recap)

`recap` renders a self-contained HTML report (file map, annotated diffs,
diagrams, schema/API summaries, real before/after screenshots, review notes) and
optionally a PNG of it, or — with `--format gfm` — a GitHub-flavoured Markdown
comment. It is the **rendering** half of a visual recap: you (the agent) author
the content as `recap.json`, `visual-shot` renders it deterministically. The
companion **`visual-recap`** skill in
[`agentic-tools`](../agentic-tools) is the authoring recipe — install it and
follow it before writing `recap.json`. The default theme is **dark** (matching a
PR comment surface); pass `--theme light` for a light report.

```bash
# Render an authored recap (HTML, plus a PNG of the whole report), dark by default
npx visual-shot recap --from recap.json --out tmp/images/PRs/recap.html --png

# Confine local image reads to an explicit directory
npx visual-shot recap --from recap.json --asset-root docs/screenshots --png

# Mechanical recap straight from a git range (file map + raw patches)
npx visual-shot recap --diff main...HEAD --out tmp/images/PRs/recap.html --png --json

# A GitHub comment instead of HTML (no browser, no provisioning)
npx visual-shot recap --from recap.json --format gfm --out recap.md --json
```

`--format gfm` maps each block to Markdown: `notes` as-is; `callout` as a
blockquote; `file-tree`/`table`/`data-model`/`api-endpoint` as tables (an
unknown `file-tree` change falls back to `M`); `diff`/`patch`/`code` as
`<details>` with a fenced diff/code block (the `patch` fence holds the raw git
patch) and annotation bullets; `mermaid` as a ` ```mermaid ` fence; `json` as a
pretty-printed ` ```json ` fence; `checklist` as `- [x]`/`- [ ]`; `columns`/`tabs`
flattened with bold labels; `image`/`image-pair` embed their destinations.
`diagram`/`wireframe` cannot render in a comment, so they emit an italic caption
placeholder (and use `--report-url` for a link). The output starts with the
sticky marker `<!-- visual-shot-recap -->` for idempotent comment upserts;
GitHub renders Mermaid fences and `<details>` natively. Prose and inline fields
may contain Markdown (`` `code` ``, `**bold**`, links) but their `<`/`>` are
neutralised, so no field can inject HTML; only `<details>`, `<summary>`, and
`<br>` are emitted structurally, and content inside fenced code blocks is passed
through literally. No new browser work happens unless `--png` is also passed, in
which case the PNG is rendered (dark by default) and referenced by its local
path when `--image-url` is absent — pass `--image-url` for a comment image that
loads.

The JSON contract is `{ version: 1, title, brief?, meta?, blocks: [...] }`; block
types are `file-tree`, `diff`, `patch`, `image`, `image-pair`, `mermaid`,
`diagram`, `wireframe`, `data-model`, `api-endpoint`, `callout`, `table`,
`checklist`, `notes`, `code`, `annotated-code`, `json`, and the `columns`/`tabs`
containers. `--diff` adds a `file-tree` (unless the JSON already has one) and one
`patch` per changed file. Validation errors name the exact block path
(`blocks[2].after`) and exit 2 without rendering.

`wireframe` renders a framed UI mockup from author `html` (optional `css`,
`caption`, `height`); `surface` is one of `browser` (default), `desktop`, `tablet`,
`mobile`, `popover`, `panel`, and `height` (a positive integer px, at most `2000`)
overrides the per-surface body height. The body renders in a `sandbox` iframe via
`srcdoc`, so author `html`/`css` is isolated to that mockup and scripts are
disabled; for a before/after, place two `wireframe` blocks in one `columns` block.
The iframe starts from a light base, so keep mockup colors light-safe or
theme-aware.

`json` renders `{ type: "json", data: <any JSON>, title?, collapsedDepth? }` as a
collapsible tree — use it for API request/response payloads or config objects
instead of a code block. `data` is required (and may be `null`, `false`, `0`, or
`""`). Keys/values are escaped. `collapsedDepth` (non-negative, ≤ `50`) sets the
initial expansion; omit it to expand everything for a `--png` screenshot.

`api-endpoint` is diff-aware: the root and each `params[]`/`responses[]` entry
accept `change` (`added`/`removed`/`modified`/`renamed`), and param/response
entries also accept `was` (the previous name/status). A removed endpoint is
outlined red and its path struck through.

- The HTML is the primary artifact and is offline-capable: local images become
  data URIs, and Mermaid SVG + syntax highlighting are baked in.
- The HTML-only path (no `--png`, no Mermaid, no code) needs **no** Chromium and
  does not provision. `--png`, Mermaid, or code highlighting provision lazily.
- `--json` returns `{ ok, format, html | markdown, png, theme, blocks, warnings }`
  (plus `mermaid`/`highlight` for html). A failed PNG screenshot is a `warning`
  (the artifact is still written), not a failure.
- Syntax highlighting and Mermaid are pinned cache assets; if a download fails,
  the recap renders unhighlighted with a warning instead of failing.
- `--png` reveals every tab panel and every collapsed JSON `<details>` in the
  screenshot; the HTML keeps interactive tabs and the author's `collapsedDepth`.

### Post a recap comment to a PR

`--format gfm` writes a comment body starting with the sticky marker
`<!-- visual-shot-recap -->`. Upsert one comment on that marker (do not post a
new comment each run):

```bash
npx visual-shot recap --from recap.json --format gfm --out recap.md --json
# peter-evans/find-comment@v3 (body-includes: '<!-- visual-shot-recap -->')
# yields steps.find.outputs.comment-id; pass it to
# peter-evans/create-or-update-comment@v4 (body-path: recap.md, edit-mode: replace).
# With gh, find the comment whose body contains the marker and PATCH it, else create it.
```

GitHub renders ` ```mermaid ` and `<details>` natively, so the comment is
interactive. `diagram`/`wireframe` bodies cannot run there — the renderer emits
their caption as a placeholder; add `--report-url <url>` to link the rendered
HTML report, and `--png`/`--image-url` to embed a screenshot.

### Recap trust boundaries (the JSON is untrusted)

- `diagram` `html`/`css` is embedded **raw** and runs as HTML in the artifact;
  `wireframe` `html`/`css` renders in a `sandbox` iframe, so it is isolated and
  scripts are disabled. Both are trusted author content; never interpolate diff
  text into either.
- Local `image`/`image-pair` `src` is confined to `--asset-root` (default: the
  `--from` file's directory, else cwd). Only real files with an allowlisted
  image extension and `<= MAX_RECAP_IMAGE_BYTES` (10 MiB) are inlined; anything
  else is dropped with a warning.
- Remote `https:` image URLs stay in the markup and are fetched when the
  artifact is opened — a recap with remote images is not strictly offline.
- The final file carries a CSP that blocks scripts and external egress, and the
  render pass only loads inline/local/about: URLs, so a crafted block cannot
  beacon or SSRF during rendering.
- `--width`/`--scale` are bounded (`320`–`4000` / `1`–`4`) and `--from` is
  capped at 8 MiB; out-of-range input exits 2.

## Parse the result

Pass `--json` for a stable object on success instead of scraping `saved <path>`:

```json
{
  "ok": true,
  "out": "/abs/path/tmp/images/PRs/my-feature.png",
  "url": "http://127.0.0.1:8080/",
  "ignoredConsoleErrors": 1,
  "consoleErrors": [],
  "pageErrors": [],
  "truncated": false
}
```

- `ok: false` with `error` means the capture itself failed (navigation, timeout,
  server down), or the arguments were invalid.
- `ok: false` with `consoleErrors`/`pageErrors` means the screenshot was written
  but the page errored. Exit code is 1 either way.
- `truncated: true` means the page produced more than 50 errors and the lists
  were capped.

`--allow-console-error` matches a literal substring first, and falls back to a
regular expression if the pattern compiles as one.

## After capturing

1. Commit the PNG (default dir `tmp/images/PRs/`).
2. Reference its raw URL in the PR body:
   `https://github.com/<owner>/<repo>/blob/<branch>/tmp/images/PRs/<name>.png?raw=true`

## Troubleshooting

- `playwright not found` / `chromium not found` → run `visual-shot setup`.
- Blank/zero-width text → fonts missing; re-run `setup` to unpack the sysroot fonts.
- `Executable doesn't exist` → interrupted download; delete `$VISUAL_SHOT_CACHE/browsers` and re-run setup.
- Missing libraries on non-Debian → `npx playwright install-deps chromium` (needs root).
- App not reachable → start the dev server, or use `--wait-for-server`.

Cache location: `$VISUAL_SHOT_CACHE` (default `~/.local/share/visual-shot`). It is
machine-global, so provisioning once covers every project on the machine.

## Releasing (maintainers)

Do not tag by hand. Bump `version` in `visual-shot/package.json`, merge to
`main`; the release workflow detects the new version and publishes the tarball.
