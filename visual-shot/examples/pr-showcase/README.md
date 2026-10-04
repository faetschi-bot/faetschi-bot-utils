# PR showcase (demo)

A demo recap used to preview what a `visual-shot recap` looks like in a pull
request. This folder is illustrative, not part of the tool.

- `recap.json` — the authored source (wireframe before/after, diffs, json,
  data-model, diff-aware api-endpoint, mermaid, checklist).
- `recap.md` — the `--format gfm` output; the PR description embeds this so
  GitHub renders the Mermaid fence, `<details>`, and tables natively.
- `recap.html` — the self-contained interactive report (dark theme).
- `recap.png` — the rendered screenshot (dark theme).

Generated with `visual-shot 0.8.0`. Regenerate with:

```bash
npx visual-shot recap --from examples/pr-showcase/recap.json --png \
  --out examples/pr-showcase/recap.html --png-out examples/pr-showcase/recap.png
npx visual-shot recap --from examples/pr-showcase/recap.json --format gfm \
  --out examples/pr-showcase/recap.md
```
