---
name: visual-recap
description: "Invoke to turn a PR, branch, commit, or git diff into a visual recap — a self-contained HTML/PNG report with a file map, annotated diffs, diagrams, schema/API summaries, and real before/after screenshots. Use for large, multi-file, UI-heavy, schema, API, or architecture changes; skip tiny obvious diffs."
---

# Visual Recap

Turn a change that already exists into a **reviewable visual artifact**: a
self-contained HTML report (optionally a PNG) that shows the *shape* of a diff —
what moved, which contracts changed, where the risky lines are — before a
reviewer reads raw line-by-line diffs.

This skill is the **authoring** half. Rendering is done by the `visual-shot`
CLI's `recap` command. You read the change, decide what matters, and write a
strict `recap.json`; `visual-shot` renders it deterministically and validates
every block. Never hand-render the report yourself, and never dump the recap as
inline chat prose — the artifact is the deliverable.

## Requirements

- A recent `visual-shot` with the `recap` command — check
  `visual-shot recap --help` shows `--only`/`--visuals-only`.
- This skill installed (e.g. `npx agentic-tools install visual-recap`).

## When to use

- The change is large, multi-file, or touches schema, API contracts,
  permissions, architecture, or review-critical behavior.
- The change alters rendered UI and a reviewer benefits from seeing states.
- Someone asks to "recap this PR/branch/commit" or "show what changed".

Skip it for small, single-file, or obvious diffs — a recap is review overhead.

## Workflow

1. **Scope the work unit.** Default to the whole change (branch vs base, or the
   commit range the user named), not just the latest commit. Exclude unrelated
   dirty work. If scope is genuinely ambiguous, state your assumption.

2. **Read the diff.** Use `git diff --stat` for the footprint and
   `git diff <range>` for the content. Work from one sequential pass; do not
   re-read the whole diff repeatedly.

3. **Inventory the surfaces.** Before authoring, list the changed routes,
   components, dialogs/popovers, role/access states, empty/error states, and
   shared abstractions. Represent each meaningful item with a block or
   intentionally omit it as tiny/redundant.

4. **Capture real UI when it changed.** Use the screenshot tool to produce a
   genuine before/after pair and reference the files in an `image-pair` block.
   Prefer real captures over hand-drawn mockups:

   ```bash
   npx visual-shot --url "$APP_URL" --name recap-before
   npx visual-shot --url "$APP_URL" --name recap-after
   ```

   When a real screenshot is not available (the UI cannot run, or you need an
   annotated mockup), fall back to a `wireframe` block: author `html` in a framed
   surface that renders in a `sandbox` iframe, isolated from the report and with
   scripts disabled. Do not invent state a real capture could show instead.

5. **Author `recap.json`** (see the contract below). Ground every structured
   field in the actual diff.

6. **Render and verify.** Post the GFM text and embed the visuals-only PNG only
   when the second run reports a non-null `png` — see
   [Posting to a PR](#posting-to-a-pr) for the two commands and
   [Verify before reporting success](#verify-before-reporting-success) for what
   to check.

## `recap.json` contract

`{ "version": 1, "title": string, "brief"?: string, "meta"?: string,
"blocks": Block[] }`. `title` <= ~70 chars; `brief` is 1-3 sentences. Unknown
block types and missing required fields fail validation with the exact path
(e.g. `blocks[2].after`). Pass `--diff <range>` to fold in the mechanical parts:
`visual-shot` adds a `file-tree` (unless your JSON already has one) plus one
`patch` tab per changed file, and `--diff` alone gives a quick mechanical recap
when no authored content exists.

### Block reference

| type | required | purpose |
|------|----------|---------|
| `file-tree` | `entries[{path, change?, note?}]` | Footprint at a glance; `change` is `added`/`modified`/`removed`/`renamed`. |
| `diff` | `before`, `after` | Before/after of a file. `language`, `summary`, `annotations`, `mode` (`split` default, `unified`). |
| `patch` | `patch` | Raw unified diff text (usually supplied by `--diff`). |
| `image` | `src` | One screenshot; `alt`, `caption`. Local paths are inlined. |
| `image-pair` | `before`, `after` | Real before/after screenshots; `captionBefore`/`captionAfter`. |
| `mermaid` | `source` | Sequence/flowchart where textual grammar is clearest. |
| `diagram` | `html` | Author HTML/CSS diagram for architecture; optional `css`, `caption`. |
| `wireframe` | `html` | Framed UI mockup from author HTML/CSS for UI/state changes; `surface` (`browser` default, `desktop`/`tablet`/`mobile`/`popover`/`panel`), optional `css`, `caption`, `height` (positive integer px, ≤ 2000). The body renders in a `sandbox` iframe, so author CSS/HTML is isolated and scripts are disabled; the iframe is light-themed, so keep mockup colors light-safe or theme-aware. Prefer real `image-pair` captures when you have them; before/after is two wireframes in a `columns` block. |
| `data-model` | `entities[{name, fields[{name,type,pk?,fk?,change?,was?}]}]` | Schema/ERD changes; optional `relations`. |
| `api-endpoint` | `method`, `path` | Contract view with diff-aware `change` (`added`/`removed`/`modified`/`renamed`) on the root and on each `params[]`/`responses[]` entry, plus `was` for the previous name/status; also `summary`, `description`, `deprecated`. |
| `callout` | `body` | Note with `tone` (`info`/`decision`/`risk`/`warning`/`success`) and optional `title`. |
| `table` | `columns`, `rows` | Simple grid. |
| `checklist` | `items[{label, note?, checked?}]` | Toggleable list. |
| `notes` | `markdown` | Prose: objective, decisions, risks. Small Markdown subset. |
| `code` / `annotated-code` | `code` | New code; annotated variety anchors `annotations` to line ranges. |
| `json` | `data` | Any JSON value as a collapsible tree; use for API request/response payloads or config objects instead of a code block. Objects show `{N keys}` and arrays `[N items]`; every key/value is escaped. Optional `title`, `collapsedDepth` (non-negative, ≤ 50; omit to expand all). `data` may be `null`, `false`, `0`, or `""`. |
| `columns` | `columns[{label, blocks}]` | Side-by-side comparison container. |
| `tabs` | `tabs[{label, blocks}]` | Group several diffs/patches; horizontal. |

Annotations on `diff`/`annotated-code` are `{ lines: "4" | "2-5", side?:
"after"|"before", label?, note? }` and mark the referenced lines. `api-endpoint`
is diff-aware: set `change` on the endpoint, or on any `params[]`/`responses[]`
entry, to mark it added/removed/modified/renamed, and add `was` with the previous
param name or response status; a `removed` endpoint renders struck through and
outlined. `json` values are escaped and never executed, so pasting a real
request/response body is safe — but still redact secrets (see Security). A
`wireframe` body renders isolated in its own `sandbox` iframe, so it cannot
restyle the report or a sibling wireframe, and its `css`/inline styles start from
a light base (`background:#fff; color:#1f2328`) — keep mockup colors light-safe
or theme-aware.

### Minimal example

```json
{
  "version": 1,
  "title": "Add rate limiting to the public API",
  "brief": "Wraps the messages handler in a sliding-window limiter and returns 429.",
  "blocks": [
    { "type": "callout", "tone": "risk", "body": "Bursts above 60 rpm now get `429`." },
    { "type": "diff", "filename": "server/routes/messages.ts", "language": "ts",
      "summary": "Gate the handler.",
      "before": "export async function post(req, res) {\n  return send(req);\n}\n",
      "after": "export async function post(req, res) {\n  if (!allowed(req)) return res.status(429).end();\n  return send(req);\n}\n",
      "annotations": [{ "lines": "2", "label": "Gate", "note": "Reject before any work." }] },
    { "type": "data-model", "entities": [
      { "name": "tokens", "fields": [
        { "name": "id", "type": "uuid", "pk": true },
        { "name": "token_rpm", "type": "integer", "change": "added" }
      ] }
    ] }
  ]
}
```

## Posting to a PR

A recap has two PR surfaces, and they must not duplicate each other:

1. **Text — `--format gfm`.** GitHub renders the structural Markdown *and*
   native ` ```mermaid ` fences, so the comment already reviews the file map,
   diffs, tables, JSON, and diagrams. It needs no browser and does not
   provision.
2. **Visual companion — `--visuals-only --png`.** A PNG is only uniquely
   valuable for what a comment **cannot** render: `wireframe` mockups, real
   `image`/`image-pair` screenshots, and raw `diagram` HTML. `--visuals-only`
   filters the recap to exactly those four block types.

```bash
# 1. The review text (files, diffs, tables, JSON, Mermaid render natively)
npx visual-shot recap --from recap.json --format gfm --out recap.md --json

# 2. The visual companion — only the blocks a comment cannot render
npx visual-shot recap --from recap.json --visuals-only --png --png-out recap-visuals.png --json
```

Embed step 2's PNG **only when its `--json` reports a non-null `png`**, then
commit it and point an image link at its raw URL. When the recap has no
wireframes/screenshots/diagrams, that run reports `blocks: 0` and `png: null`
and writes no file — post `recap.md` alone.

Do **not** embed the full report PNG (`--png` without `--visuals-only`) next to
the GFM comment; it duplicates the text. Reserve the whole-report PNG for when a
single-image recap is explicitly wanted (e.g. an attachment or slide).

## Grounding and budgets

- **Ground every field in the diff.** `diff`, `data-model`, `api-endpoint`,
  `patch`, and `file-tree` must use real paths, fields, methods, and text — never
  inferred or invented. When the diff lacks a fact, leave it out; mark anything
  inferred in `notes`.
- **Lean, not thin.** No boilerplate intro/disclaimer blocks; the title, brief,
  and `file-tree` carry provenance. But do include the implementation evidence:
  a `file-tree` and the key changed files as `diff`/`annotated-code` under one
  `tabs` block.
- **Budgets.** 3-8 key-change tabs; prefer under ~150 lines per diff; title
  <= ~70 characters. Summarize or link the rest of a long file instead of
  dumping it.
- **UI changes need real screenshots.** An `image-pair` beats prose for a
  visible delta. For menus/popovers, capture the focused sub-surface. Only when a
  real capture is impossible should you fall back to a `wireframe` mockup.

## Security

- **Never transcribe secrets.** A diff can contain API keys, tokens, webhook
  URLs, or `.env` values. Redact them (`sk-•••`, `<redacted>`) in every block,
  caption, and note — never copy the real value into `recap.json`.
- Recaps can expose unreleased schema and internal endpoints; treat the artifact
  like the source it summarizes.

## Render trust boundaries

The recap JSON is **untrusted input**; the renderer enforces these limits:

- **`diagram` `html`/`css` is raw.** That field is embedded verbatim and runs as
  HTML in the artifact. Treat it as trusted author content and never interpolate
  diff text, file contents, or user input into it. **`wireframe` `html`/`css` is
  also trusted author content**, but it is rendered inside a `sandbox` iframe
  (`srcdoc`), so it is isolated from the report and other wireframes and scripts
  are disabled.
- **`image`/`image-pair` `src` must be a real image file inside the recap's
  directory** (the render's asset root; `--asset-root` overrides it). Only
  regular files with an allowlisted image extension and at most
  `MAX_RECAP_IMAGE_BYTES` (10 MiB) are inlined as data URIs — anything else is
  dropped with a warning and renders as "image not found". Never point an image
  path at a secret, an env file, or anything outside the recap directory.
- **Remote `https:` image URLs are fetched when the artifact is opened**, not at
  render time, so a recap that references them is not strictly offline.
- **The written file carries a CSP** (`RECAP_CSP`) that blocks scripts and
  external egress, and the render pass itself only loads inline (`data:`), local
  (`file:`), and `about:` URLs — a crafted `diagram` or markdown `<img>` cannot
  beacon or SSRF while `recap` renders.
- **`--width` / `--scale` are bounded** (`320`–`4000` / `1`–`4`) and a `--from`
  file is capped at `MAX_RECAP_SOURCE_BYTES` (8 MiB); out-of-range values exit
  `2`.

## Verify before reporting success

Verify the two surfaces you will actually post, using the commands in
[Posting to a PR](#posting-to-a-pr): require `"ok": true` and inspect the
`warnings` array (`[]` when clean). A missing image or failed Mermaid render
appears as a warning; fix the JSON and re-render rather than reporting a partial
recap. Do not claim success from a non-zero exit or from hand-reviewed HTML
alone. If neither the GFM text nor a visuals-only PNG is needed, a plain `--png`
smoke render is fine for local inspection — just do not embed it next to the GFM
text.
