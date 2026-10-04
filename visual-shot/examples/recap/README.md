# recap examples

A rendered showcase of the recap blocks, generated with `visual-shot recap`
(`visual-shot 0.10.0`, default 1100px width and scale 1). Use it to review
behavior without rendering anything yourself.

## Files

| File | What it is |
|------|------------|
| `demo.json` | The recap source (wireframe, json, diff-aware api-endpoint, tabs, columns, callout). |
| `demo.html` | The rendered, self-contained report — open it in a browser to click the tabs and expand/collapse the JSON. |
| `demo-light.png` | PNG of `demo.html` (light theme). |
| `demo-dark.png` | PNG of `demo.html` (dark theme). |

## Regenerate

Dark is the recap default, so pass `--theme` explicitly to keep both committed
PNGs reproducible (and to regenerate `demo.html` in the light theme it was
rendered with). The dark pass writes its throwaway HTML to a temp path so it
cannot clobber the committed light `demo.html`:

```bash
npx visual-shot recap --from examples/recap/demo.json --theme light --out examples/recap/demo.html --png --png-out examples/recap/demo-light.png
npx visual-shot recap --from examples/recap/demo.json --theme dark --out /tmp/visual-shot-demo-dark.html --png --png-out examples/recap/demo-dark.png
```

## What to look for

- **`wireframe` isolation (before/after).** Both panes reuse the same class
  names (`.bar`, `.danger`, `.row`) with different rules, but each renders
  correctly: the "Before" toolbar shows a red `Delete all`, the "After" pane
  shows the blue selection bar. The body renders in a sandboxed iframe, so the
  two stylesheets cannot leak into each other. Surfaces shown: `browser`,
  `mobile`, `popover`.
- **`json` collapse vs. screenshot.** Open `demo.html` and click the
  "Collapsed (depth 0)" tab — the tree starts folded to the root. The PNG
  (`demo-light.png`) shows every node expanded, because `--png` opens all
  `<details>` at render time so a screenshot is complete.
- **Diff-aware `api-endpoint`.** `POST /v1/messages` carries a `modified` badge,
  `model  modified (was model_id)`, `stream  added`, and `429  added`; the
  removed `DELETE /v1/legacy/messages/{id}` is outlined and struck through with
  `removed` + `deprecated`.
- **Tabs in the HTML vs. the PNG.** The saved HTML keeps interactive tabs (one
  visible); the PNG flattens them so both panels appear with labels.

## Trust boundaries

`wireframe` `html`/`css` (and `diagram` `html`/`css`) are raw, trusted author
content. The wireframe body is sandboxed (scripts disabled) and its styles are
isolated; the saved report also carries a Content-Security-Policy that blocks
scripts. Never interpolate untrusted diff text into these fields.
