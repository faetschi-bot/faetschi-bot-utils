---
name: remotion
description: "Install and use Remotion to build code-rendered videos with React: product demos, launch and marketing videos, programmatic motion graphics, and MP4 rendering. Covers the upstream Remotion agent skills, scaffolding, preview, render, verification, and troubleshooting."
---

# Remotion

## Read first

- **Installation, requirements, license, and troubleshooting:** follow
  [`install/remotion.md`](../../install/remotion.md). It is the canonical
  installer guide and this skill defers to it.
- **Authoring:** if the upstream `remotion-best-practices` skill is available,
  load it before writing composition code, then load the specific upstream
  skill it routes to (`remotion-markup`, `remotion-render`, `remotion-maps`,
  and so on). Do not restate or replace those rules here.
- This skill covers the pack's install and verification contract only.

## Install and verify

Run the upstream installer from the project root. It installs all 12 Remotion
skills from `remotion-dev/skills`:

```bash
npx skills@1.7.4 add remotion-dev/skills \
  --skill '*' \
  --agent opencode --agent codex --agent pi --agent claude-code \
  --copy -y
```

Add `-g` for a global install, but ask the user first.

| Agent | Project | Global |
|-------|---------|--------|
| OpenCode, Codex, Pi (shared) | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |

Check the files:

```bash
ls .agents/skills/remotion-* .claude/skills/remotion-*
```

Then confirm the agent sees the router:

| Agent | Check |
|-------|-------|
| Claude Code | `/remotion-best-practices`, or `/skills` |
| Codex | `$remotion-best-practices`, or `/skills` |
| OpenCode | Ask for `remotion-best-practices`; loaded skills are listed in the session |
| Pi | `/skill:remotion-best-practices`, or `/skills` |

The skills CLI needs Node 22.20+. Remotion itself does not need a system
FFmpeg: v4 bundles FFmpeg and downloads headless Chrome on the first render.
For the manual-copy fallback, destination details, and Chrome library errors,
use the installer guide above.

## Production loop

1. **Confirm the license.** Free for individuals and for-profit organizations
   with up to 3 employees; otherwise the user needs a Remotion company license.
   Ask before installing or rendering for a larger company.
2. **Install the skills** with the command above, and verify discovery.
3. **Scaffold** when the project has no Remotion setup:

   ```bash
   npx create-video@latest --yes --blank video
   cd video
   npm install
   ```

4. **Author** the composition with the upstream skills loaded. Keep text, UI,
   and data exact; this is the reason to use Remotion over a generative model.
5. **Preview** in the Studio before rendering:

   ```bash
   npx remotion studio
   ```

6. **Render** the composition ID reported by `npx remotion compositions src/index.ts`:

   ```bash
   npx remotion render src/index.ts <CompositionId> out/video.mp4
   ```

7. **Verify a real file** before reporting success:

   ```bash
   test -s out/video.mp4 && echo "OK: $(wc -c < out/video.mp4) bytes"
   ```

   PowerShell:

   ```powershell
   if ((Get-Item .\out\video.mp4).Length -gt 0) { "OK" } else { throw "empty render" }
   ```

## Guardrails

- Never claim success from a successful bundle, a Studio screenshot, or exit
  code 0 alone. The proof is a rendered, non-empty MP4.
- Do not vendor, fork, or copy the upstream Remotion skills into a project or
  into this pack. Install them from `remotion-dev/skills`.
- Do not install globally without asking; a global skill can shadow the
  project's version-specific copy.
- Do not use a generative video model when the video must show exact UI, text,
  numbers, or brand assets. Use Remotion.
- Do not install system FFmpeg for Remotion. Fix Chrome shared-library errors
  instead; see the guide.
- Check the license before use by companies with more than 3 employees, and
  stop if the user has not confirmed it.
- Keep the render output out of version control unless the user asks for the
  artifact.
