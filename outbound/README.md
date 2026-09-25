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
- `gh` (optional) — used to verify that the default branch requires pull
  requests.

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
```

| Flag | Meaning |
|------|---------|
| `--repo <path>` | repository to check or configure (default `cwd`, resolved to the git root) |
| `--tag-prefix <p>` | also verify tags named `<p><version>` exist |
| `--force` | overwrite an existing release config (`init` only) |
| `--json` | print a machine-readable result object |

`doctor` exits non-zero when a check fails, so an agent can verify a repo before
claiming it is release-ready. With `--json`:

```json
{
  "ok": false,
  "dir": "/abs/path",
  "skipped": 1,
  "checks": [
    { "name": "git-repo", "ok": true, "detail": "/abs/path", "hint": "", "skipped": false },
    { "name": "release-config", "ok": false, "detail": "no .github/release.yml", "hint": "Run: outbound init", "skipped": false },
    { "name": "release-workflow", "ok": true, "detail": ".github/workflows/release.yml", "hint": "", "skipped": false },
    { "name": "pr-only", "ok": true, "detail": "gh not installed", "hint": "Install the GitHub CLI to verify branch protection.", "skipped": true }
  ]
}
```

- `ok: false` means at least one check failed; read `hint` for the fix.
- `skipped > 0` means some checks could not be evaluated (`pr-only` needs `gh`
  authentication and admin access). Report that instead of claiming full
  verification.

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
