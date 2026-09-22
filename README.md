# faetschi-bot-utils

Small, reusable utilities by [@faetschi-bot](https://github.com/faetschi-bot).

| Utility | Description |
|---------|-------------|
| [`visual-shot/`](./visual-shot) | Reproducible headless-Chromium screenshots for PR review, with no-root provisioning. |

Each folder is self-contained: copy it into a project or add the repo as a git
submodule. See the utility's own README for installation and usage.

## Releasing

Utilities are distributed as GitHub Release tarballs, so no npm registry account
is needed. For `visual-shot`, bump the version in `visual-shot/package.json`,
commit, then push a matching tag:

```bash
git tag visual-shot-v0.1.1
git push origin visual-shot-v0.1.1
```

The `Release visual-shot` workflow packs the tarball and attaches it to the
release. Consumers install it by URL:

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/visual-shot-v0.1.1/visual-shot-0.1.1.tgz
```
