# opencode-collection

Install a curated set of [OpenCode](https://opencode.ai) plugins with one
command. This tool is a catalog plus a thin installer: it does **not** copy
plugin code, it runs an installer the upstream project already publishes — so
updates, trust, and licenses stay with the upstream project.

It is the OpenCode sibling of [`pi-collection`](../pi-collection), which does
the same for Pi and OMP.

## Why a catalog

OpenCode plugins arrive in two shapes.

**Package plugins** are installed by OpenCode's own plugin manager and recorded
in `opencode.json(c)`:

```text
opencode  opencode plugin add @plannotator/opencode@latest
```

**Self-installing plugins** ship their own installer and need it to configure
more than a plugin entry — for example
[`oc-codex-multi-auth`](https://github.com/ndycode/oc-codex-multi-auth) writes a
model catalog and a TUI quota component:

```text
npx       npx -y oc-codex-multi-auth@latest --modern
```

`catalog.json` records which installer each plugin uses, the spec, and any
args. The upstream repo stays the only copy of the plugin, so a license that
forbids redistribution is respected.

## After installing codex-multi-auth

Sign in to a ChatGPT account so the plugin can serve Codex/GPT models:

```bash
opencode auth login   # choose OpenAI, then a Codex OAuth method
```

Check the account pool and remaining quota at any time with the plugin's own
standalone command:

```bash
npx -y oc-codex-multi-auth@latest limits
```

It prints each account's 5h and weekly headroom, renewal times, plan, resets,
and the pool total. See
[its Getting Started](https://github.com/ndycode/oc-codex-multi-auth/blob/main/docs/getting-started.md)
for the full `codex-*` tool and CLI reference.

## Install (pick one)

```bash
# A. Release tarball (recommended)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/opencode-collection-latest/opencode-collection.tgz

# B. Vendored copy
cp -r opencode-collection /path/to/project/tools/opencode-collection

# C. Git submodule
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

## Verify before reporting success

Always run the machine-readable check and require `"ok": true`:

```bash
npx opencode-collection doctor --json
```

It validates `catalog.json` (unique kebab-case names, a known installer, a
non-empty spec, valid optional args, an https homepage, and a license per
entry) and reports whether the installer commands are on `PATH`. A missing
installer is reported, not a failure; an invalid catalog exits non-zero.

## Use it

```bash
# List what the catalog offers, with each plugin's installer and spec.
npx opencode-collection list

# Install every plugin in the catalog.
npx opencode-collection install --all

# Install one plugin.
npx opencode-collection install codex-multi-auth

# See the exact installer commands without running them.
npx opencode-collection install --all --dry-run
```

Flags for `install`:

| Flag | Effect |
|------|--------|
| `--all` | Select every catalog extension. Cannot combine with names. |
| `--dry-run` | Print the installer commands and install nothing. |
| `--json` | Print one machine-readable result object. |

`--root <path>` points the tool at a different catalog, for a vendored copy or a
fork.

Installs are **global**: OpenCode's plugin manager and the self-installing
plugins write the user's configuration. Neither documents a project scope, so
this tool does not invent one.

`install` stops at the first failed step and reports the steps it did not reach:
`notAttempted` in `--json`, or `not attempted` lines in text output.

Scope, trust, and updates are the upstream installer's job: after installing,
manage a package plugin with `opencode plugin list`, `opencode plugin update`,
and `opencode plugin remove`.

## Catalog format

`catalog.json` holds one entry per logical plugin, naming the installer that
owns it:

```json
{
  "extensions": [
    {
      "name": "codex-multi-auth",
      "summary": "ChatGPT Plus/Pro OAuth with Codex/GPT routing, multi-account rotation, quota in the prompt line, and codex-* tools.",
      "installer": "npx",
      "spec": "oc-codex-multi-auth@latest",
      "args": ["--modern"],
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
- `args` is optional and appended after the spec by installers that accept it.
- `homepage` and `license` record the upstream project; do not copy code a
  license forbids.

Enforcement lives in `lib/catalog.mjs`; run `npx opencode-collection doctor`
after editing.

## Adding an extension

1. Append an entry to `catalog.json` with its installer, spec, homepage, and
   license.
2. Prefer the `opencode` installer (OpenCode's own plugin manager) for package
   plugins; use `npx` when the plugin ships an installer that configures setup
   OpenCode's plugin entry cannot, as `codex-multi-auth` does.
3. Run `npx opencode-collection doctor --json` and require `"ok": true`.

## Releasing (maintainers)

Do not tag by hand. Bump `version` in `opencode-collection/package.json`, merge
to `main`; the release workflow detects the new version and publishes the
tarball.
