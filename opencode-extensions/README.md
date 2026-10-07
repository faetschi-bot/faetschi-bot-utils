# opencode-extensions

Install a curated set of [OpenCode](https://opencode.ai) plugins with one
command. This tool is a catalog plus a thin installer: it does **not** copy
plugin code, it runs OpenCode's own plugin manager (`opencode plugin add`), so
updates, trust, and licenses stay with the upstream project.

It is the OpenCode sibling of [`pi-extensions`](../pi-extensions), which does
the same for Pi and OMP.

## Why a catalog

OpenCode plugins are packages that OpenCode's plugin manager installs and
records in `opencode.json(c)`:

```text
opencode plugin add @plannotator/opencode@latest
```

`catalog.json` records the spec for each curated plugin, and the tool hands it
to `opencode plugin add`. The upstream repo stays the only copy of the plugin,
so a license that forbids redistribution is respected.

Some plugins also ship their own installer for optional extras — for example
[`oc-codex-multi-auth`](https://github.com/ndycode/oc-codex-multi-auth) has a
standalone installer that can add a model catalog and a TUI quota component.
This tool installs the plugin itself and points at the upstream for those
extras, because OpenCode's own manager stays correct across OpenCode versions
and config formats.

## Install (pick one)

```bash
# A. Release tarball (recommended)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/opencode-extensions-latest/opencode-extensions.tgz

# B. Vendored copy
cp -r opencode-extensions /path/to/project/tools/opencode-extensions

# C. Git submodule
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

## Verify before reporting success

Always run the machine-readable check and require `"ok": true`:

```bash
npx opencode-extensions doctor --json
```

It validates `catalog.json` (unique kebab-case names, a known installer, a
non-empty spec, an https homepage, and a license per entry) and reports whether
the `opencode` CLI is on `PATH`. A missing CLI is reported, not a failure; an
invalid catalog exits non-zero.

## Use it

```bash
# List what the catalog offers, with each plugin's installer and spec.
npx opencode-extensions list

# Install every plugin in the catalog.
npx opencode-extensions install --all

# Install one plugin.
npx opencode-extensions install codex-multi-auth

# See the exact installer commands without running them.
npx opencode-extensions install --all --dry-run
```

Flags for `install`:

| Flag | Effect |
|------|--------|
| `--all` | Select every catalog extension. Cannot combine with names. |
| `--dry-run` | Print the installer commands and install nothing. |
| `--json` | Print one machine-readable result object. |

`--root <path>` points the tool at a different catalog, for a vendored copy or a
fork.

Installs are **global**: `opencode plugin add` writes the user's configuration,
and OpenCode documents no project scope, so this tool does not invent one.

`install` stops at the first failed step and reports the steps it did not reach:
`notAttempted` in `--json`, or `not attempted` lines in text output.

Scope, trust, and updates are OpenCode's job: after installing, manage a plugin
with `opencode plugin list`, `opencode plugin update`, and
`opencode plugin remove`.

## After installing codex-multi-auth

Sign in to a ChatGPT account so the plugin can serve Codex/GPT models:

```bash
opencode auth login   # choose OpenAI, then a Codex OAuth method
```

The upstream project documents optional extras, such as a model catalog that
adds `--variant` presets and a TUI quota component; see
[its Getting Started](https://github.com/ndycode/oc-codex-multi-auth/blob/main/docs/getting-started.md).

## Catalog format

`catalog.json` holds one entry per logical plugin, naming the installer that
owns it:

```json
{
  "extensions": [
    {
      "name": "codex-multi-auth",
      "summary": "ChatGPT Plus/Pro OAuth with Codex/GPT routing, multi-account rotation, quota in the prompt line, and codex-* tools.",
      "installer": "opencode",
      "spec": "oc-codex-multi-auth@latest",
      "homepage": "https://github.com/ndycode/oc-codex-multi-auth",
      "license": "MIT"
    }
  ]
}
```

- `name` is lowercase kebab-case and unique.
- `installer` must be one of `INSTALLERS` (`lib/installers.mjs`).
- `spec` is passed verbatim to the installer. It is not validated beyond being
  non-empty, because the installer owns its own source syntax.
- `homepage` and `license` record the upstream project; do not copy code a
  license forbids.

Enforcement lives in `lib/catalog.mjs`; run `npx opencode-extensions doctor`
after editing.

## Adding an extension

1. Append an entry to `catalog.json` with its installer, spec, homepage, and
   license.
2. Prefer `opencode plugin add <spec>`: an npm name with a version, tag, or
   range, or an npm-compatible Git spec such as `github:owner/repo`.
3. Run `npx opencode-extensions doctor --json` and require `"ok": true`.

## Releasing (maintainers)

Do not tag by hand. Bump `version` in `opencode-extensions/package.json`, merge
to `main`; the release workflow detects the new version and publishes the
tarball.
