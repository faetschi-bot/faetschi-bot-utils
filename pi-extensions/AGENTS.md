# pi-extensions — agent guide

The canonical recipe for agents. Prefer it and `pi-extensions --help` over
reading the source.

`pi-extensions` installs a curated set of [Pi](https://pi.dev) and OMP
extensions. It is a catalog (`catalog.json`) plus a thin installer that
delegates to each harness's own package manager: `pi install <spec>` and
`omp plugin install <spec>`. It never copies extension code, so upstream
licenses and updates stay with the upstream project.

## What an agent needs

| Capability | Why |
|------------|-----|
| Node 20+ | Run the CLI. |
| Read access to this repo (or the release tarball) | To read `catalog.json`. |
| `pi` and/or `omp` on `PATH` | To actually install; `list`, `doctor`, and `--dry-run` work without them. |
| Network, once | The native installer fetches the extension source. |

## Verify before reporting success

Always run the machine-readable check and require `"ok": true`:

```bash
npx pi-extensions doctor --json
```

It validates the catalog and reports harness detection. A missing `pi`/`omp` CLI
is reported as `found: false`, not a failure; a malformed catalog prints
`errors` and exits 1.

## Commands

```text
pi-extensions list [--harness pi|omp|both] [--json]
pi-extensions doctor [--json]
pi-extensions install [<name>...] [--all] [--harness pi|omp|both|auto] [--global|--local] [--dry-run] [--json]
```

- Default harness for `install` is `auto`: every CLI found on `PATH`. Erroring
  out when none is found is correct — tell the user to install `pi` or `omp`.
- Default scope is global (the user). `--local` is Pi-only; OMP has no local
  scope, so `--local` with OMP is a usage error (exit 2), not a silent global
  install.
- `--dry-run` prints the native commands and requires no harness CLI.
- `install` stops at the first failed step; the steps it never reached appear
  under `notAttempted` in `--json` and as `not attempted` lines in text output.
- Exit codes: 0 success, 1 runtime/environment, 2 usage.

## Do not

- Do not copy extension source into this repo. `pi-you-should-know` is
  `UNLICENSED`; the catalog only points at it.
- Do not shell out to an installer that is not in the catalog, and do not invent
  harness flags (for example a local-scope flag for OMP that is not documented).
- Do not bypass `catalog.json` validation; `doctor` is the gate.

## Architecture

```text
bin/pi-extensions.mjs   CLI entry: parse, dispatch, print, exit codes
lib/harnesses.mjs       HARNESSES + INSTALLERS (single source of truth)
lib/catalog.mjs         catalog JSON read + validation (pure) + list/filter
lib/install.mjs         PATH lookup, plan (pure), execute
lib/errors.mjs          CliError with an exit code
catalog.json            the extension catalog (data)
test/catalog.test.mjs   catalog validation and filtering
test/install.test.mjs   command planning, PATH lookup, execution
test/cli.test.mjs       end-to-end CLI contract, fully offline
```

Adding a harness is one entry in `INSTALLERS` (`lib/harnesses.mjs`); `HARNESSES`
and every `--harness` list derive from it. Adding an extension is one entry in
`catalog.json`. Keep both changes small and test them.

## Catalog schema

Each entry: `name` (lowercase kebab-case, unique), `summary`, and `sources`.
Each source: `installer` (must equal its harness key), `spec` (passed verbatim
to the harness), `homepage` (https), `license`. An entry need not support every
harness; `install` skips missing harnesses with a reason.

## Testing and checks

```bash
npm test          # node --test test/ (headless; never runs a real installer)
npm run validate  # node bin/pi-extensions.mjs doctor
node --check bin/pi-extensions.mjs && node --check lib/catalog.mjs && node --check lib/install.mjs
```

Tests inject the PATH lookup and the command runner, so they stay offline. To
keep them from ever finding a real `pi`/`omp`, the CLI tests spawn with an empty
`PATH` where a missing harness is the point.

## Releasing (maintainers)

Do not tag by hand. Bump `pi-extensions/package.json`, merge to `main`; the
release workflow publishes the tarball and refreshes the `-latest` pointer.
