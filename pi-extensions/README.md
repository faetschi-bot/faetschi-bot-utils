# pi-extensions

Install a curated set of [Pi](https://pi.dev) and OMP extensions with one
command. This tool is a catalog plus a thin installer: it
does **not** copy extension code, it runs each harness's own package manager, so
updates, trust prompts, and licenses stay with the upstream project.

## Why a catalog

Some extensions are not redistributable. [`pi-you-should-know`](https://github.com/aliceisjustplaying/pi-you-should-know)
is `UNLICENSED`, so its code cannot be vendored here. Instead, `catalog.json`
records where each harness should fetch the extension from:

```text
pi   pi install git:github.com/aliceisjustplaying/pi-you-should-know
omp  omp plugin install github:ubranch/omp-you-should-know
```

## Install (pick one)

```bash
# A. Release tarball (recommended)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/pi-extensions-latest/pi-extensions.tgz

# B. Vendored copy
cp -r pi-extensions /path/to/project/tools/pi-extensions

# C. Git submodule
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

## Verify before reporting success

Always run the machine-readable check and require `"ok": true`:

```bash
npx pi-extensions doctor --json
```

It validates `catalog.json` (unique kebab-case names, at least one known harness
per entry, an installer and an https homepage and a license per source) and
reports whether the `pi` and `omp` CLIs are on `PATH`. A missing harness CLI is
reported, not a failure; an invalid catalog exits non-zero.

## Use it

```bash
# List what the catalog offers, with each harness source.
npx pi-extensions list

# Install for every harness found on PATH (global by default).
npx pi-extensions install --all

# Install one extension for a specific harness.
npx pi-extensions install you-should-know --harness omp

# See the exact native commands without running them.
npx pi-extensions install --all --dry-run
```

Flags for `install`:

| Flag | Effect |
|------|--------|
| `--harness pi\|omp\|both\|auto` | Which harness to install for. `auto` (default) uses the CLIs found on `PATH`. |
| `--global` / `--local` | User scope (default) or project scope. `--local` is Pi-only; OMP has no local scope, so it is refused rather than guessed. |
| `--all` | Select every catalog extension. Cannot combine with names. |
| `--dry-run` | Print the native commands and install nothing. |
| `--json` | Print one machine-readable result object. |

`--root <path>` points the tool at a different catalog, for a vendored copy or a
fork.

Scope, trust, and updates are the harness's job: after installing, manage the
extension with `pi list`, `pi update --extensions`, or `omp`'s own commands.

## Catalog format

`catalog.json` holds one entry per logical extension, with one source per
harness:

```json
{
  "extensions": [
    {
      "name": "you-should-know",
      "summary": "A side agent watches the session and shows one card above the prompt.",
      "sources": {
        "pi": {
          "installer": "pi",
          "spec": "git:github.com/aliceisjustplaying/pi-you-should-know",
          "homepage": "https://github.com/aliceisjustplaying/pi-you-should-know",
          "license": "UNLICENSED"
        },
        "omp": {
          "installer": "omp",
          "spec": "github:ubranch/omp-you-should-know",
          "homepage": "https://github.com/ubranch/omp-you-should-know",
          "license": "MIT"
        }
      }
    }
  ]
}
```

- `name` is lowercase kebab-case and unique.
- `sources` must list at least one of `pi` or `omp`; an entry may be missing a
  harness, and `install` then skips it with a reason instead of failing.
- `spec` is passed verbatim to the harness installer. It is not validated
  beyond being non-empty, because each harness owns its own source syntax.
- Enforcement lives in `lib/catalog.mjs`; run `npx pi-extensions doctor` after
  editing.

## Adding an extension

1. Append an entry to `catalog.json` with a `summary` and every harness source
   you can support.
2. Record the upstream `homepage` and `license`; do not copy code that a license
   forbids.
3. Run `npx pi-extensions doctor --json` and require `"ok": true`.

## Releasing (maintainers)

Do not tag by hand. Bump `version` in `pi-extensions/package.json`, merge to
`main`; the release workflow detects the new version and publishes the tarball.
