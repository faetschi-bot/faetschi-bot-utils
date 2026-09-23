# visual-shot — agent guide

Reproducible headless-Chromium screenshots for PR review. Point it at a running
web app (any language, any framework) and it writes a PNG. This file is the
canonical recipe; prefer it and `visual-shot --help` over reading the source.

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
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-v0.2.0/visual-shot-0.2.0.tgz

# B. Vendored copy
cp -r visual-shot /path/to/project/tools/visual-shot

# C. Git submodule (one copy shared across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

`setup` is optional: the first capture provisions automatically. To do it up
front (and fail fast):

```bash
npx visual-shot setup          # tarball install
node tools/visual-shot/bin/visual-shot.mjs setup   # vendored/submodule
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

## Parse the result

Pass `--json` for a stable object instead of scraping `saved <path>`:

```json
{
  "ok": true,
  "out": "/abs/path/tmp/images/PRs/my-feature.png",
  "url": "http://127.0.0.1:8080/",
  "ignoredConsoleErrors": 1,
  "consoleErrors": [],
  "pageErrors": []
}
```

- `ok: false` with `error` means the capture itself failed (navigation, timeout,
  server down).
- `ok: false` with `consoleErrors`/`pageErrors` means the screenshot was written
  but the page errored. Exit code is 1 either way.

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
