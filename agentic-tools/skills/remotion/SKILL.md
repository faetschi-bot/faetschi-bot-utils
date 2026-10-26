---
name: remotion
description: "Install Remotion and its upstream agent skills, then build, preview, render, and verify code-rendered videos: product demos, launch and marketing videos, and motion graphics. Includes troubleshooting."
---

# Remotion

## Read first

- Open the [Remotion install guide](https://github.com/faetschi-bot/faetschi-bot-utils/blob/main/agentic-tools/install/remotion.md)
  for installation, destinations, license details, and troubleshooting. Do not
  install from memory.
- Load the upstream `remotion-best-practices` skill before writing composition
  code, then the skill it routes to (`remotion-markup`, `remotion-render`,
  `remotion-maps`, and so on). Authoring rules live there, not here.
- This skill owns the install and verification contract only.

## Install and verify

```bash
npx skills@1.7.4 add remotion-dev/skills \
  --skill '*' \
  --agent opencode --agent codex --agent pi --agent claude-code \
  --copy -y
```

Add `-g` for global scope; ask the user first.

| Agent | Project | Global |
|-------|---------|--------|
| OpenCode, Codex, Pi (shared) | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |

```bash
ls .agents/skills/remotion-* .claude/skills/remotion-*
```

Then confirm the router is discoverable:

| Agent | Check |
|-------|-------|
| Claude Code | `/remotion-best-practices` or `/skills` |
| Codex | `$remotion-best-practices` or `/skills` |
| OpenCode | Skills are listed in the session; ask for `remotion-best-practices` |
| Pi | `/skill:remotion-best-practices` or `/skills` |

## Production loop

1. **License:** free for individuals and for-profit companies with up to 3
   employees; larger companies need a Remotion company license. Ask, and stop
   if unconfirmed.
2. **Install** the skills and verify discovery.
3. **Scaffold** only when the project has no Remotion setup:
   `npx create-video@latest --yes --blank video && cd video && npm install`
4. **Author** with the upstream skills loaded; keep UI, text, and data exact.
5. **Preview:** `npx remotion studio`.
6. **Render** an ID from `npx remotion compositions src/index.ts`:
   `npx remotion render src/index.ts <CompositionId> out/video.mp4`
7. **Verify:** `test -s out/video.mp4 && echo "OK: $(wc -c < out/video.mp4) bytes"`
   (PowerShell check in the guide).

## Guardrails

- Never claim success from a bundle, a Studio screenshot, or exit 0 alone.
  Require a rendered, non-empty MP4.
- Do not vendor or fork the upstream skills; install from `remotion-dev/skills`.
- Do not install globally without asking.
- Do not use a generative video model when exact UI, text, numbers, or brand
  assets are required.
- Do not install system FFmpeg; Remotion bundles it. Fix Chrome shared-library
  errors instead.
- Keep render output out of version control unless the user asks for it.
