# opencode-collection — agent guide

The canonical recipe for agents. Prefer it and `opencode-collection --help`
over reading the source.

`opencode-collection` installs a curated set of [OpenCode](https://opencode.ai)
plugins. It is a catalog (`catalog.json`) plus a thin installer that delegates
to an installer the upstream project already publishes: OpenCode's own plugin
manager (`opencode plugin add <spec>`), or a plugin's own `npx -y <spec> [args]`
when it ships one. It never copies plugin code, so upstream licenses and
updates stay with the upstream project. It is the OpenCode sibling of
`pi-collection`.

## What an agent needs

| Capability | Why |
|------------|-----|
| Node 20+ | Run the CLI. |
| Read access to this repo (or the release tarball) | To read `catalog.json`. |
| `opencode` and/or `npx` on `PATH` | To actually install; `list`, `doctor`, and `--dry-run` work without them. |
| Network, once | The installer fetches the plugin. |

## Verify before reporting success

Always run the machine-readable check and require `"ok": true`:

```bash
npx opencode-collection doctor --json
```

It validates the catalog and reports installer detection. A missing
`opencode`/`npx` command is reported as `found: false`, not a failure; a
malformed catalog prints `errors` and exits 1.

## Commands

```text
opencode-collection list [--json]
opencode-collection doctor [--json]
opencode-collection install [<name>...] [--all] [--dry-run] [--json]
```

- Installer commands are detected on `PATH`; a step whose command is missing
  fails with a clear error, so tell the user to install it.
- Installs are global: OpenCode's plugin manager and the self-installing
  plugins write the user's config. Neither documents a project scope, so this
  tool does not invent one.
- `--dry-run` prints the installer commands and requires no installer CLI.
- `install` stops at the first failed step; the steps it never reached appear
  under `notAttempted` in `--json` and as `not attempted` lines in text output.
- Exit codes: 0 success, 1 runtime/environment, 2 usage.
- After installing `codex-multi-auth`, the user must run `opencode auth login`
  (OpenAI, then a Codex OAuth method). Check quota with
  `npx -y oc-codex-multi-auth@latest limits`.

## Do not

- Do not copy plugin code into this repo. The catalog only points at it.
- Do not shell out to an installer that is not in `INSTALLERS`, and do not
  invent installer flags the upstream tool does not document.
- Do not bypass `catalog.json` validation; `doctor` is the gate.

## Architecture

```text
bin/opencode-collection.mjs   CLI entry: parse, dispatch, print, exit codes
lib/installers.mjs            INSTALLERS + INSTALLER_NAMES (single source of truth)
lib/catalog.mjs               catalog JSON read + validation (pure) + list
lib/install.mjs               PATH lookup, plan (pure), execute
lib/errors.mjs                CliError with an exit code
catalog.json                  the plugin catalog (data)
test/catalog.test.mjs         catalog validation and display
test/install.test.mjs         command planning, PATH lookup, execution
test/cli.test.mjs             end-to-end CLI contract, fully offline
```

Adding an installer is one entry in `INSTALLERS` (`lib/installers.mjs`); catalog
validation, `doctor`, and PATH detection all derive from it. Adding a plugin is
one entry in `catalog.json`. Keep both changes small and test them.

## Catalog schema

Each entry: `name` (lowercase kebab-case, unique), `summary`, `installer` (one
of `INSTALLERS`), `spec` (passed verbatim to the installer), optional `args`
(appended after the spec when the installer accepts them), `homepage` (https),
and `license`. Prefer the `opencode` installer for package plugins; use `npx`
only when the plugin ships an installer that adds setup OpenCode's plugin entry
cannot.

## Testing and checks

```bash
npm test          # node --test test/ (headless; never runs a real installer)
npm run validate  # node bin/opencode-collection.mjs doctor
node --check bin/opencode-collection.mjs && node --check lib/catalog.mjs && node --check lib/installers.mjs && node --check lib/install.mjs
```

Tests inject the PATH lookup and the command runner, so they stay offline. To
keep them from ever finding a real installer, the CLI tests spawn with an empty
`PATH` where a missing installer is the point.

## Releasing (maintainers)

Do not tag by hand. Bump `opencode-collection/package.json`, merge to `main`;
the release workflow publishes the tarball and refreshes the `-latest` pointer.
