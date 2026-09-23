# visual-shot — agent guide

Reproducible headless-Chromium screenshots and image diffs for PR review. Point
it at a running web app (any language, any framework) and it writes a PNG. This
file is the canonical recipe; prefer it and `visual-shot --help` over reading the
source.

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
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-v0.4.0/visual-shot-0.4.0.tgz

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
