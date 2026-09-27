# Contributing

`faetschi-bot-utils` is a monorepo of independently versioned tools. This file
covers the branch and release flow; each tool has its own guide in
`<tool>/AGENTS.md`.

## Branch model

- **`main`** — stable. The default branch, and the only branch releases are
  published from.
- **`develop`** — integration. All regular work lands here.
- **`feat/*`, `fix/*`, `docs/*`** — short-lived branches cut from `develop` and
  merged back into `develop` via pull request.

```
feat/x ─┐
fix/y  ─┴─▶ pull request ─▶ develop ─(promotion PR)─▶ main ─▶ release
```

Open PRs against **`develop`**. `main` only receives `develop → main` promotion
PRs. Do not push to either long-lived branch directly.

## The one rule: the PR title is the changelog line

GitHub builds each release body from the **merged PRs** between the previous
release and the new tag, not from commit messages. So the PR title is the
user-facing sentence that appears in the changelog. Write it for a stranger.

- One logical change per PR.
- `feat: …` / `fix: …` / `docs: …` titles get their type label applied
  automatically (`.github/workflows/pr-labels.yml`). Add labels by hand when the
  title is not conventional.
- GitHub silently ignores labels that do not exist on the repo and drops such
  PRs into *Other Changes* — keep the label set below in place.

## Labels

`.github/release.yml` groups PRs into release-note sections:

| Section | Labels |
|---------|--------|
| Breaking Changes | `breaking-change`, `semver-major` |
| Features | `enhancement`, `feature`, `semver-minor` |
| Fixes | `bug`, `fix` |
| Documentation | `documentation`, `docs` |
| Other Changes | everything else |
| *(hidden from notes)* | `ignore-for-release` and PRs by `dependabot[bot]` |

Scope labels are added from changed paths and are for filtering only:
`tool:visual-shot`, `tool:outbound`, `tool:agentic-tools`, `ci`, plus
`dependencies` (for `chore(deps): …`) and `ignore-for-release` (for
`chore:` / `ci:` / `build:` / `test:` / `style:` titles).

Create the labels once (needs a GitHub login; `gh` optional). The PR-labels
workflow also creates any missing label on the fly, so this is mostly so the
names exist before the first PR arrives:

```bash
gh label create breaking-change     --color b60205
gh label create enhancement         --color a2eeef
gh label create bug                 --color d73a4a
gh label create documentation       --color 0075ca
gh label create dependencies        --color 0366d6
gh label create ignore-for-release  --color ededed
gh label create tool:visual-shot    --color ededed
gh label create tool:outbound       --color ededed
gh label create tool:agentic-tools  --color ededed
gh label create ci                  --color 5319e7
```

## Releasing a tool

Each tool is versioned and released independently. Nothing is tagged by hand.

1. Branch from `develop`, bump `"version"` in `<tool>/package.json`, and open a
   PR into `develop`. CI runs on the PR.
2. Merge into `develop`. Nothing releases yet — releases only run on `main`.
3. When ready to ship, open a **promotion PR** `develop → main` and merge it. The
   matching `.github/workflows/release-<tool>.yml` resolves `<tool>-v<version>`
   and, if that release does not exist yet, publishes the tarball and refreshes
   the moving `<tool>-latest` alias behind the install URLs. Promotion batches
   everything since the last release into one milestone changelog.
4. Merging without a version bump is a no-op.

To add a new tool, follow the checklist in `README.md`.

## Maintainer setup

Done once in GitHub repository settings, since repo files cannot do it:

- Create the labels above.
- Protect **`main` and `develop`** and require pull requests. `outbound doctor`
  only inspects the default branch, so verify `develop` by hand.
- Create `develop` from `main`:

  ```bash
  git checkout main && git pull
  git branch develop main
  git push -u origin develop
  ```

`main` stays the default branch — it is what consumers see, and GitHub reads
`.github/release.yml` from the default branch. Contributors pick `develop` as the
PR base.
