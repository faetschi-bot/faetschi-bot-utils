# agentic-tools — agent guide

A small, language-agnostic pack of skills (and, later, hooks) that AI coding
agents can load. Each skill is a `SKILL.md` with YAML frontmatter
(`name`, `description`) and a body of instructions. This file is the canonical
recipe; prefer it and `agentic-tools --help` over reading the source.

## What an agent needs

| Capability | Why |
|------------|-----|
| Read access to this repo (or the release tarball) | To install the pack and read the skills. |
| Write access to the **target** project | To copy a skill into the agent's skills directory. |
| Node 20+ | To run the `agentic-tools` validator. |

Nothing else, and nothing runs in the target project: a skill is text the agent
reads, not a program.

## Bootstrap (pick one)

```bash
# A. Release tarball (recommended)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/agentic-tools-latest/agentic-tools.tgz

# B. Vendored copy
cp -r agentic-tools /path/to/project/tools/agentic-tools

# C. Git submodule (one copy shared across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
```

## Verify before reporting success

Always run the machine-readable check and require `"ok": true`:

```bash
npx agentic-tools doctor --json
```

It validates every `skills/*/SKILL.md`: frontmatter has a `name` that matches the
directory plus a non-empty `description`, and all relative links and in-page
anchors resolve. It exits non-zero on any problem.

## Use a skill

The fastest path is `install`, which copies one or more skill directories into
the agent's skills directory (the `SKILL.md` plus any supporting files):

```bash
# OpenCode project skills: <project>/.opencode/skills/<name>/
npx agentic-tools install test-audit

# Every skill, into the user-global OpenCode dir (~/.config/opencode/skills/)
npx agentic-tools install --all --global

# Other presets, or an explicit destination directory
npx agentic-tools install test-audit --target claude
npx agentic-tools install test-audit --target agents --global
npx agentic-tools install --all --dir ./tools/skills
```

Targets (project / global):

| Target | Project | Global |
|--------|---------|--------|
| `opencode` (default) | `.opencode/skills` | `~/.config/opencode/skills` |
| `claude` | `.claude/skills` | `~/.claude/skills` |
| `agents` | `.agents/skills` | `~/.agents/skills` |

`install` validates each skill first, copies it to `<dir>/<name>`, and refuses to
overwrite an existing skill directory unless you pass `--force`. It also supports
`--dry-run` and `--json`.

Alternatives when you do not want to install:

1. **Copy by hand** into the agent's skills directory:

   ```bash
   mkdir -p .opencode/skills
   cp -r node_modules/agentic-tools/skills/test-audit .opencode/skills/
   ```

   OpenCode also auto-loads `.claude/skills/` and `.agents/skills/` in the
   project and their `~/.<agent>/skills` global forms, and you can register this
   pack's `skills/` directory directly via `skills.paths` in `opencode.json`.

2. **Point the agent at the file** when you invoke it, e.g. "follow
   `node_modules/agentic-tools/skills/test-audit/SKILL.md`". Use this when you
   want the skill for one task and not for the whole project.

List what is available with:

```bash
npx agentic-tools list
```

## Skills

| Skill | Use it when |
|-------|-------------|
| [`test-audit`](./skills/test-audit/SKILL.md) | Writing, changing, reviewing, or sweeping tests. Gates new tests and audits low-value, implementation-coupled, or duplicative coverage. |

## Adding a skill (maintainers)

1. Create `skills/<name>/SKILL.md` with frontmatter:

   ```markdown
   ---
   name: <name>
   description: "One or two sentences saying when to invoke this skill."
   ---
   ```

2. The `name` must be lowercase kebab-case and equal the directory name.
3. Keep relative links inside the skill directory so they resolve after copy.
4. Run `npx agentic-tools doctor` and require `ok`.

## Releasing (maintainers)

Do not tag by hand. Bump `version` in `agentic-tools/package.json`, merge to
`main`; the release workflow detects the new version and publishes the tarball.
