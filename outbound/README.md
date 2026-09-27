# outbound

Clean, PR-based release changelogs. `outbound` checks whether a repository is
set up so GitHub can **auto-generate** its release notes — and scaffolds the
missing piece.

GitHub builds a release body from the **merged pull requests** between the
previous release and the new tag. Every PR title becomes a changelog line, and a
commit pushed straight to the default branch falls back to its raw commit
message. `outbound` makes that pipeline explicit and verifiable.

## Requirements

- **Node 20+**.
- A git repository, ideally on GitHub.
- `gh` (optional) — used for the remote checks: whether the labels the config
  references exist on the repo, whether recent merged PR titles read as
  changelog lines, and whether the default branch requires pull requests.

## Install

Install the released tarball (no npm registry account needed):

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/outbound-latest/outbound.tgz
npx outbound doctor
```

Or vendor it from the
[`faetschi-bot-utils`](https://github.com/faetschi-bot/faetschi-bot-utils)
monorepo (`outbound/`):

```bash
# Vendored copy
cp -r outbound /path/to/project/tools/outbound
node tools/outbound/bin/outbound.mjs doctor

# Git submodule (share one copy across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
node tools/faetschi-bot-utils/outbound/bin/outbound.mjs doctor
```

## CLI

```
outbound doctor [options]     check the repo's release hygiene, then exit
outbound init [options]       write a .github/release.yml, then exit
outbound setup [options]      scaffold a complete release setup, then exit
```

| Flag | Meaning |
|------|---------|
| `--repo <path>` | repository to check or configure (default `cwd`, resolved to the git root) |
| `--tag-prefix <p>` | also verify tags named `<p><version>` exist |
| `--release-branch <b>` | release branch for `setup` (default `main`) |
| `--package <path>` | version file for `setup`/`doctor` (default `package.json`) |
| `--workflow <path>` | release workflow path for `setup` |
| `--no-remote` | skip the checks that call GitHub via `gh` |
| `--quiet` | suppress human-readable output (exit status remains authoritative) |
| `--force` | overwrite generated files (`init`/`setup` only) |
| `--json` | print a machine-readable result object |
| `--version` | print the installed outbound version |

## One-command adoption

For a normal single-package GitHub repository:

```bash
npx outbound setup
npx outbound doctor --json
```

`setup` writes only missing files (use `--force` to replace existing generated
files):

- `.github/release.yml` — release-note categories;
- `.github/workflows/release.yml` — version-driven release workflow with
  `contents: write` and a package-scoped `--notes-start-tag`;
- `.outbound.json` — the selected release branch, tag prefix, version file, and
  workflow path, so later `doctor` calls need no repeated flags;
- `.github/outbound-labels.sh` — creates the labels referenced by the generated
  release config (`gh` authentication is required when you run it).

For a monorepo package:

```bash
npx outbound setup --package packages/widget/package.json \
  --tag-prefix widget-v --workflow .github/workflows/release-widget.yml
```

Review generated files before committing them. `setup` never overwrites an
existing file unless `--force` is supplied.

`doctor` runs these checks:

| Check | Needs | Fails when |
|-------|-------|------------|
| `git-repo` | — | not inside a git work tree |
| `release-config` | — | no `.github/release.yml` (or `.yaml`) |
| `release-config-valid` | — | the config does not parse, a category is empty or has no labels, a label is repeated across categories, or there is no catch-all `"*"` (or it is not the last category) |
| `release-workflow` | — | no workflow runs `gh release create --generate-notes` / `action-gh-release` |
| `release-workflow-write` | — | that workflow does not grant `contents: write` |
| `release-labels` | `gh` | a label the config references is missing on the repo, so its PRs would be dropped into "Other Changes" |
| `pr-titles` | `gh` | a recent merged PR title is unusable (`wip`, `misc`, a branch name, …) |
| `pr-only` | `gh` | the default branch does not require pull requests |
| `tag-scheme` | `--tag-prefix` | no tags match `<prefix>*` |

When no prefix is configured, `doctor` auto-detects a single prefix from
semantic-version tags. Multiple families (common in monorepos) produce a
warning and require an explicit `--tag-prefix` or `.outbound.json` setting.

`--no-remote` skips the three `gh` checks, so `doctor` stays fully offline.

`doctor` exits non-zero when a check fails, so an agent can verify a repo before
claiming it is release-ready. With `--json`:

```json
{
  "ok": false,
  "dir": "/abs/path",
  "skipped": 1,
  "checks": [
    { "name": "git-repo", "ok": true, "detail": "/abs/path", "hint": "", "skipped": false },
    { "name": "release-config", "ok": true, "detail": ".github/release.yml", "hint": "", "skipped": false, "severity": "error" },
    { "name": "release-config-valid", "ok": true, "detail": "4 category(ies), catch-all present", "hint": "", "skipped": false },
    { "name": "release-workflow", "ok": true, "detail": ".github/workflows/release.yml", "hint": "", "skipped": false },
    { "name": "release-workflow-write", "ok": true, "detail": ".github/workflows/release.yml grants \"contents: write\"", "hint": "", "skipped": false },
    { "name": "release-labels", "ok": false, "detail": "labels not on the repo: breaking-change, semver-major", "hint": "Create them so those PRs are not silently dropped into \"Other Changes\" (Settings -> Labels).", "skipped": false },
    { "name": "pr-titles", "ok": true, "detail": "10 recent merged PR titles look usable", "hint": "", "skipped": false },
    { "name": "pr-only", "ok": true, "detail": "gh not installed", "hint": "Install the GitHub CLI to run the remote checks.", "skipped": true }
  ]
}
```

- `ok: false` means at least one check failed; read `hint` for the fix.
- Every check has a `severity`: `error` blocks `ok`, `warning` is actionable
  but does not block release readiness, and `info` describes configuration or a
  skipped remote check.
- `skipped > 0` means some checks could not be evaluated (`release-labels`,
  `pr-titles`, and `pr-only` need `gh`; `pr-only` also needs admin access). Report
  that instead of claiming full verification.

## Configure categories

```bash
npx outbound init
```

writes `.github/release.yml`, which groups PRs into sections by label and drops
noise:

```yaml
changelog:
  exclude:
    labels:
      - ignore-for-release
    authors:
      - dependabot[bot]
  categories:
    - title: Breaking Changes
      labels: [breaking-change, semver-major]
    - title: Features
      labels: [enhancement, feature, semver-minor]
    - title: Fixes
      labels: [bug, fix]
    - title: Other Changes
      labels: ["*"]
```

Edit the label names to match the labels actually used on the repo's PRs.

## Automatic releases

Version the tag from a file and let CI create it on merge; never tag by hand. A
minimal `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Publish if the version is new
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          tag="v$(node -p "require('./package.json').version")"
          gh release view "$tag" >/dev/null 2>&1 && exit 0
          gh release create "$tag" --target "$GITHUB_SHA" --title "$tag" --generate-notes
```

Bumping `package.json` and merging then produces a release whose body is the list
of merged PRs since the last one.

For a monorepo, use a distinct tag prefix for each package and pass the previous
tag explicitly to GitHub's generated-notes command. The workflow produced by
`setup` does this automatically with `--notes-start-tag`, preventing a widget
release from absorbing another package's PRs.

## Why PRs

- GitHub's generated notes list merged PRs by title; a direct commit has no title
  to use, so its raw commit message appears instead.
- Squash-merging keeps the default branch history equal to the PR list.
- `.github/release.yml` can only classify PRs, not commits.

## Agents and CI

- [`AGENTS.md`](./AGENTS.md) is the canonical recipe for AI agents: the one rule,
  bootstrap options, `doctor --json` verification, the automatic-release recipe,
  and the monorepo tag gotcha.

## Releasing

Releases are GitHub Release tarballs — no npm registry account or 2FA involved.
**Releases are automatic on merge:** bump `"version"` in
`outbound/package.json`, commit, and merge to `main`. The `Release outbound`
workflow creates the `outbound-v<version>` tag and GitHub Release. If the version
was already released, the workflow is a no-op. You do not push tags by hand.
