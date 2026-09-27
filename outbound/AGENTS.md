Make a repository produce a **clean release changelog** with GitHub's
auto-generated release notes, and nothing hand-written. `outbound` checks
whether a repo is set up for that and scaffolds the missing config. This file is
the canonical recipe; prefer it and `outbound --help` over reading the source.

## The one rule

**Every change lands through a pull request, and the PR title becomes a
changelog line.** That is the whole trick. GitHub builds the release body by
listing the merged PRs between the previous release and the new tag — it does
not read your commit messages if a PR exists. So a clean changelog is a
side-effect of good PR hygiene, not extra work.

Corollaries:

- Never push directly to the default branch. Protect it and require PRs.
- PR title = the user-facing sentence you want in the changelog. Write it for a
  stranger, not for yourself.
- One logical change per PR. Three clean lines beat one "misc fixes" dump.

## What an agent needs

| Capability | Why |
|------------|-----|
| A git repository (ideally GitHub) with a remote | Releases and generated notes live on GitHub. |
| Write access to the target project | To add `.github/release.yml` / a release workflow. |
| Node 20+ | To run `outbound`. |
| `gh` (optional) | `outbound doctor` uses it to verify repo labels, recent PR titles, and branch protection. |
| Network (optional) | Only for the `gh`-based checks. |

## Bootstrap (pick one)

```bash
# A. Release tarball (recommended)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/outbound-latest/outbound.tgz

# B. Vendored copy
cp -r outbound /path/to/project/tools/outbound

# C. Git submodule (one copy shared across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

Then `npx outbound setup` (recommended for a new target) and
`npx outbound doctor --json` (tarball) or
`node tools/outbound/bin/outbound.mjs doctor --json` (vendored/submodule).
`outbound` resolves the current directory to the git root, so it works from any
subdirectory.

## Verify before reporting success

Always run the machine-readable check and require `"ok": true`:

```bash
npx outbound doctor --json
```

It checks: the repo is a git work tree; `.github/release.yml` exists and is
valid (parseable, every category titled and labelled, one catch-all `"*"` last,
no label reused); a workflow creates releases with `--generate-notes` and grants
`contents: write`; and, with `gh`, that the labels the config references exist on
the repo, that recent merged PR titles read as changelog lines, and that the
default branch requires PRs. `--tag-prefix <p>` checks tags named
`<p><version>` and enables package/tag safety checks. A missing first-release
tag is a warning; malformed configuration, missing workflow permissions, missing
labels, bad PR titles, and missing branch protection remain errors. It exits
non-zero when an error-level check fails.

`setup` scaffolds `.github/release.yml`, a release workflow, `.outbound.json`,
and `.github/outbound-labels.sh` without overwriting existing files unless
`--force` is given. Persisted setup values (`releaseBranch`, `tagPrefix`,
`package`, and `workflow`) are used by later `doctor` runs; explicit CLI flags
override them. For monorepos, use a package-specific prefix such as
`widget-v`; generated workflows pass `--notes-start-tag` so GitHub does not use
another package's release as the range boundary.

Add `--no-remote` to skip every `gh` check when offline. If `"skipped"` is
greater than 0, some checks could not be evaluated (the `gh` checks need
authentication; `pr-only` also needs admin). Say so rather than claiming full
verification.

## Set it up

For a new project, prefer the complete scaffold:

```bash
npx outbound setup
npx outbound doctor --json
```

Use `init` when you only want the release-note categories:

```bash
npx outbound init          # writes .github/release.yml (refuses to overwrite; --force to replace)
npx outbound doctor --json
```

`.github/release.yml` groups PRs into sections by label and drops noise. The
scaffold ships Breaking Changes / Features / Fixes / Other, excludes
`ignore-for-release` and `dependabot[bot]`. Edit the label names to match the
target repo — GitHub only uses labels that actually exist on its PRs.

## What GitHub puts in the notes

`gh release create "$TAG" --generate-notes` (or the Release UI's "Generate
release notes") walks the commits between the **previous release** and the new
tag. For a monorepo, add `--notes-start-tag <previous-package-tag>` to pin the
range to the same package:

```bash
gh release create "$TAG" --generate-notes --notes-start-tag "$PREVIOUS_TAG"
```

It emits:

- one line per **merged PR**: its title, author, and `#number`;
- any commit **not** associated with a PR, using the commit message as a
  fallback (this is the mess you are avoiding);
- a `New Contributors` section;
- a `**Full Changelog**` compare link.

Nothing in the body is typed by hand, and no agent drafts it.

## Wire up automatic releases

Version the tag from a file, and let CI create it on merge — never tag by hand.
Put this in `.github/workflows/release.yml`:

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
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Publish if the version is new
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          tag="v$(node -p "require('./package.json').version")"
          gh release view "$tag" >/dev/null 2>&1 && exit 0
          gh release create "$tag" --target "$GITHUB_SHA" --title "$tag" --generate-notes
```

Then releasing = bump `version`, merge. Re-merging without a bump is a no-op.

## Monorepo gotcha

With several tools released from one repo, tag them per tool (`visual-shot-v*`,
`outbound-v*`). GitHub picks the previous tag by **release**, not by tag prefix,
so its automatic range can span another tool's tags and pull in unrelated PRs.
Use the `setup`-generated workflow, which passes `--notes-start-tag`, or add it
to an existing workflow. `outbound doctor --tag-prefix <prefix>` warns when a
workflow is not package-scoped. If a range still mismatches, curate the body
with `gh release edit "$TAG" --notes-file NOTES.md`.

## Checklist for a clean release

1. Default branch protected; PRs required.
2. Every change is a PR with a clear title.
3. Labels applied (`bug`, `enhancement`, `breaking-change`, …) and present on the
   repo, so `release-labels` passes.
4. `.github/release.yml` present and matching those labels.
5. CI creates the tag and runs `gh release create … --generate-notes`.
6. `outbound doctor --json` reports `"ok": true`; review any `warning` checks.

## Releasing outbound (maintainers)

Do not tag by hand. Bump `version` in `outbound/package.json`, merge to `main`;
the release workflow detects the new version and publishes the tarball.
