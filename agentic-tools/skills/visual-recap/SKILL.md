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

- `visual-shot` >= 0.6.0 (`visual-shot recap --help`).
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

5. **Author `recap.json`** (see the contract below). Ground every structured
   field in the actual diff.

6. **Render and verify.**

   ```bash
   npx visual-shot recap --from recap.json --out tmp/images/PRs/recap.html --png --json
   ```

   Require `"ok": true`. Then hand the reviewer the HTML/PNG path, or the raw
   markdown/URL your environment uses for PR attachments.

## Recipe: fold in the mechanical parts

You do not have to hand-write the file map or copy raw patches. Pass the range
and `visual-shot` adds a `file-tree` (unless your JSON already has one) plus one
`patch` tab per changed file:

```bash
npx visual-shot recap --from recap.json --diff main...HEAD --png
```

Use `--diff` alone for a quick mechanical recap when no authored content exists.

## `recap.json` contract

`{ "version": 1, "title": string, "brief"?: string, "meta"?: string,
"blocks": Block[] }`. `title` <= ~70 chars; `brief` is 1-3 sentences. Unknown
block types and missing required fields fail validation with the exact path
(e.g. `blocks[2].after`).

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
| `data-model` | `entities[{name, fields[{name,type,pk?,fk?,change?,was?}]}]` | Schema/ERD changes; optional `relations`. |
| `api-endpoint` | `method`, `path` | Contract view; `params`, `responses`, `summary`, `description`, `deprecated`. |
| `callout` | `body` | Note with `tone` (`info`/`decision`/`risk`/`warning`/`success`) and optional `title`. |
| `table` | `columns`, `rows` | Simple grid. |
| `checklist` | `items[{label, note?, checked?}]` | Toggleable list. |
| `notes` | `markdown` | Prose: objective, decisions, risks. Small Markdown subset. |
| `code` / `annotated-code` | `code` | New code; annotated variety anchors `annotations` to line ranges. |
| `columns` | `columns[{label, blocks}]` | Side-by-side comparison container. |
| `tabs` | `tabs[{label, blocks}]` | Group several diffs/patches; horizontal. |

Annotations on `diff`/`annotated-code` are `{ lines: "4" | "2-5", side?:
"after"|"before", label?, note? }` and mark the referenced lines.

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
  visible delta. For menus/popovers, capture the focused sub-surface.

## Security

- **Never transcribe secrets.** A diff can contain API keys, tokens, webhook
  URLs, or `.env` values. Redact them (`sk-•••`, `<redacted>`) in every block,
  caption, and note — never copy the real value into `recap.json`.
- Recaps can expose unreleased schema and internal endpoints; treat the artifact
  like the source it summarizes.

## Verify before reporting success

```bash
npx visual-shot recap --from recap.json --png --json
```

Require `"ok": true` and inspect the `warnings` array (`[]` when clean). A
missing image or failed Mermaid render appears as a warning; fix the JSON and
re-render rather than reporting a partial recap. Do not claim success from a
non-zero exit or from hand-reviewed HTML alone.
