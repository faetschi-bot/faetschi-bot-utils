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
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/agentic-tools-v0.1.0/agentic-tools-0.1.0.tgz

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

Skills are addressed by their `SKILL.md` file. There are two common ways to
attach one to an agent:

1. **Copy into the agent's skills directory** (so the agent discovers it
   automatically). The exact path depends on the agent or harness — for
   OpenCode that is `.opencode/skill/<name>/SKILL.md` (or `skills/`) in the
   project, or `~/.config/opencode/skill/<name>/SKILL.md` globally:

   ```bash
   mkdir -p .opencode/skill
   cp -r node_modules/agentic-tools/skills/test-audit .opencode/skill/
   ```

   OpenCode also auto-loads `~/.claude/skills/<name>/SKILL.md` and
   `~/.agents/skills/<name>/SKILL.md`, and you can register this pack's
   `skills/` directory directly via `skills.paths` in `opencode.json`.

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
