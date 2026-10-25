# Install Remotion

[Remotion](https://www.remotion.dev/) renders React components to video files. Use
it for programmatic motion graphics: product demos, launch videos, feature
walkthroughs, captioned clips, and any video whose frames must show exact UI,
text, or data. It is not a generative video model and it does not synthesize
footage.

HTML-first users may prefer HyperFrames. Do not install HyperFrames here.

This guide documents upstream installation and verification. It does not vendor
Remotion or its agent skills.

## Requirements

- Node 22.20+ to run the skills CLI (`skills@1.7.4` declares `>=22.20.0`).
  Remotion v4 itself supports Node 16+, and this repo's baseline is Node 20+.
- `npm`/`npx`, `git`, and network access on the first render.
- No system FFmpeg. Remotion v4 bundles FFmpeg and downloads a headless Chrome
  shell (about 100 MB) on the first render. Do not install FFmpeg with
  `apt`, `brew`, or `choco` for Remotion.
- On minimal Linux images, that Chrome shell still needs the usual shared
  libraries. See [Troubleshooting](#troubleshooting).

## Check the license first

Remotion is free for individuals, non-profits, and for-profit organizations with
up to 3 employees. Larger for-profit organizations need a Remotion company
license. Confirm the user's organization size before installing or rendering for
a company; stop and ask if it is over 3 employees.

License terms: <https://www.remotion.dev/license>

## Install the upstream agent skills

Remotion maintains 12 agent skills in
[`remotion-dev/skills`](https://github.com/remotion-dev/skills). The router is
`remotion-best-practices`; the rest cover create, markup, studio, render, maps,
captions, multimedia, docs, interactivity, saas, and upgrade.

Ask before a global install. Project scope is recommended so the skills are
committed with the project and shared by the team.

Project scope:

```bash
npx skills@1.7.4 add remotion-dev/skills \
  --skill '*' \
  --agent opencode --agent codex --agent pi --agent claude-code \
  --copy -y
```

Global scope: add `-g` to the same command.

Flags, verified against `skills@1.7.4`:

- `--skill '*'` installs all 12 skills. Use `--skill remotion-best-practices`
  for the router only.
- `--copy` copies files instead of symlinking; use it on Windows and in CI.
- `-y` skips the confirmation prompt.
- `--list` lists the repository's skills without installing. Run it first if
  the CLI reports unknown flags; bump the pinned version only after re-testing.

Destinations:

| Agent | Project | Global |
|-------|---------|--------|
| OpenCode, Codex, Pi (shared) | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |

The CLI writes one directory per skill, e.g.
`.agents/skills/remotion-best-practices/`. The shared `.agents/skills/` path is
resolved from `$HOME`. Claude Code's global path is resolved from
`CLAUDE_CONFIG_DIR`, falling back to the passwd home, not `$HOME`. `CODEX_HOME`
and `PI_CODING_AGENT_DIR` do not move the shared `.agents/skills/` path.

## Verify the skills are discoverable

Check the files first:

```bash
ls .agents/skills/remotion-* .claude/skills/remotion-*
```

Then confirm the agent loaded them:

| Agent | Check |
|-------|-------|
| Claude Code | `/remotion-best-practices`, or `/skills` |
| Codex | `$remotion-best-practices`, or `/skills` |
| OpenCode | The session lists the skills; ask for `remotion-best-practices` |
| Pi | `/skill:remotion-best-practices`, or `/skills` |

A skill that does not appear in the agent's list is not installed, even if the
directory exists. Restart the session before concluding it failed.

## Manual fallback

When `npx skills` is unavailable, clone upstream and copy the top-level skill
directories:

```bash
git clone --depth 1 https://github.com/remotion-dev/skills /tmp/remotion-skills
mkdir -p .agents/skills .claude/skills
cp -R /tmp/remotion-skills/skills/remotion-* .agents/skills/
cp -R /tmp/remotion-skills/skills/remotion-* .claude/skills/
```

For global scope, use `~/.agents/skills/` and `~/.claude/skills/` from the
table.

Do not copy the nested `remotion-best-practices/remotion-*` directories as
separate top-level skills. They are upstream's internal copies of the same
skills and are already inside the tree you copied.

## Scaffold and prove a render

Run all commands from the project root. A render is the only proof that the
install works.

```bash
npx create-video@latest --yes --blank video
cd video
npm install
npx remotion compositions src/index.ts
npx remotion render src/index.ts <CompositionId> out/video.mp4
```

Take `<CompositionId>` from the `compositions` output. The blank template ships
`MyComp`.

Require exit code 0 from each command and a non-empty output file before
reporting success:

```bash
test -s out/video.mp4 && echo "OK: $(wc -c < out/video.mp4) bytes"
```

PowerShell:

```powershell
if ((Get-Item .\out\video.mp4).Length -gt 0) {
  "OK: $((Get-Item .\out\video.mp4).Length) bytes"
} else {
  throw "render produced an empty file"
}
```

Delete the `video` directory after the check if it was only a probe.

## Update and remove

- Update the agent skills with the CLI, or re-run the install command:
  `npx skills update remotion-best-practices --yes`
- Update a project's Remotion packages with `npx remotion upgrade`. It also
  refreshes project-local Remotion skills.
- Remove the skills by deleting the installed directories, e.g.
  `rm -rf .agents/skills/remotion-* .claude/skills/remotion-*`. For a scoped
  removal use `npx skills remove --skill '*' -y`.

## Troubleshooting

| Symptom | Action |
|---------|--------|
| `chrome-headless-shell: error while loading shared libraries: libnspr4.so` on Debian/Ubuntu | Install the Chrome shared libraries as root: `apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2`. Then run `npx remotion browser ensure`. |
| Chrome download fails or times out | Retry `npx remotion browser ensure` on a working network; delete `node_modules/.remotion/chrome-headless-shell` and retry if the download is corrupt. |
| Render runs out of memory | Lower concurrency: `npx remotion render src/index.ts <CompositionId> out/video.mp4 --concurrency=1`. Each worker holds a browser tab, so fewer workers use less memory. |
| Slow first render | Expected: bundling plus the one-time Chrome download. Later renders reuse both. |
| Windows path or permission errors | Install skills with `--copy`, keep the project path short, and run the render from PowerShell. |
| `Could not find composition with ID ...` | Use an ID from `npx remotion compositions`; IDs are case-sensitive. |

## Sources

- Remotion: <https://www.remotion.dev/>
- License: <https://www.remotion.dev/license>
- Agent skills: <https://github.com/remotion-dev/skills>
- Skills CLI: <https://www.npmjs.com/package/skills>
- create-video: <https://www.remotion.dev/docs/cli/create-video>
