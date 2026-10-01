# agentic-tools

Reusable skills (and, later, hooks) for AI coding agents. Each skill is a
`SKILL.md` with YAML frontmatter and a body of instructions an agent loads when a
task matches. The pack is language-agnostic: a skill is text the agent reads, not
a program that runs in your project.

## Requirements

- **Node 20+** — only to run the `agentic-tools` validator.
- An agent that can load skills (e.g. OpenCode). See
  [Use a skill](#use-a-skill).

## Install

Install the pack itself. This only puts it on disk — it does **not** add any
skill to your agent; choose skills in [Use a skill](#use-a-skill).

Install the released tarball (no npm registry account needed):

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/agentic-tools-latest/agentic-tools.tgz
npx agentic-tools doctor
```

Or vendor it from the
[`faetschi-bot-utils`](https://github.com/faetschi-bot/faetschi-bot-utils)
monorepo (`agentic-tools/`):

```bash
# Vendored copy
cp -r agentic-tools /path/to/project/tools/agentic-tools
node tools/agentic-tools/bin/agentic-tools.mjs doctor

# Git submodule (share one copy across projects)
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
node tools/faetschi-bot-utils/agentic-tools/bin/agentic-tools.mjs doctor
```

## CLI

```
agentic-tools list [options]                 list the skills in this package
agentic-tools doctor [options]               validate every SKILL.md, then exit
agentic-tools install <skill...> [options]   copy skills into an agent skills dir
agentic-tools install --all [options]        copy every skill in the pack
```

| Flag | Meaning |
|------|---------|
| `--root <path>` | package root to inspect (default: this package) |
| `--target <name>` | install preset: `opencode` (default), `claude`, `agents` |
| `--global` | install to the user-global dir instead of the project |
| `--dir <path>` | explicit destination skills dir (overrides `--target`/`--global`) |
| `--all` | select every skill in the pack |
| `--force` | overwrite existing skill directories |
| `--dry-run` | report what would be installed without writing anything |
| `--json` | print a machine-readable result object |

`doctor` validates every `skills/*/SKILL.md`: frontmatter has a `name` that
matches the directory plus a non-empty `description`, and all relative links and
in-page anchors resolve. It exits non-zero on any problem, so CI and agents can
verify a skill before trusting it.

```bash
$ npx agentic-tools doctor --json
{
  "ok": true,
  "root": "/path/to/agentic-tools",
  "skills": [
    { "name": "agent-friendly-code", "ok": true, "errors": [], "warnings": [] },
    { "name": "test-audit", "ok": true, "errors": [], "warnings": [] }
  ]
}
```

## Skills

| Skill | Use it when |
|-------|-------------|
| [`agent-friendly-code`](./skills/agent-friendly-code/SKILL.md) | Writing or changing code, auditing a codebase for agent-hostile structure, or setting up a project's agent instruction file. Applies the read-time cost bar. |
| [`test-audit`](./skills/test-audit/SKILL.md) | Writing, changing, reviewing, or sweeping tests. Gates new tests at authoring time and audits existing tests for low-value, implementation-coupled, or duplicative coverage. |

### agent-friendly-code

Three modes, one cost model: the next reader is an agent, so reads truncate,
attention degrades with context, and grep is the navigation API.

- **Authoring** applies the bar to the agent's own edits: small searchable
  units, grep-unique names, provenance comments, explicit types, flat control
  flow, contextual errors, headless tests, injectable dependencies.
- **Audit** sweeps an existing codebase read-only, ranks findings by navigation
  cost, records [candidate evidence](./skills/agent-friendly-code/SKILL.md#audit),
  and lands one coherent behavior-preserving batch at a time.
- **Conventions** encodes the project-specific choices in `AGENTS.md` (or the
  equivalent) from a template, without duplicating the skill.

The skill is deliberately project-agnostic: the test command, formatter, and
framework conventions come from the target project's `AGENTS.md` and CI config.

### test-audit

Two modes, one value bar:

- **Authoring** gates every new or changed test at write time with four
  questions: what contract it protects, what regression makes it fail, why
  existing coverage misses that failure, and whether it needs a test-only
  production seam.
- **Audit** sweeps existing tests for assertion-free probes, self-comparisons,
  copied fixtures, exact source greps, duplicated contracts, mocks that
  implement the asserted behavior, and similar [junk
  patterns](./skills/test-audit/SKILL.md#junk-patterns).

The skill is deliberately project-agnostic: it defines the value bar, while the
concrete test command, formatter, and review gate come from the target project's
`AGENTS.md` and CI config.

## Use a skill

`install <name...>` copies only the named skills; `install --all` copies every
skill in the pack. List what is available with `npx agentic-tools list`. Each
selected directory — the `SKILL.md` plus any supporting files — is validated
first and copied into the agent's skills directory, where it is discovered
automatically:

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

It refuses to overwrite an existing skill directory unless you pass `--force`.
Because the whole selection is checked before anything is copied, a single
existing destination without `--force` refuses the entire batch. `install` also
supports `--dry-run` to preview and `--json` for scripting.

To copy by hand instead, OpenCode reads `.opencode/skills/`, and also auto-loads
`.claude/skills/` and `.agents/skills/` in the project plus their
`~/.<agent>/skills` global forms; you can also register this pack's `skills/`
directory directly via `skills.paths` in `opencode.json`. Alternatively point the
agent at the file for a single task: "follow
`node_modules/agentic-tools/skills/test-audit/SKILL.md`".

## Adding a skill

1. Create `skills/<name>/SKILL.md` with frontmatter:

   ```markdown
   ---
   name: <name>
   description: "One or two sentences saying when to invoke this skill."
   ---
   ```

2. Keep `name` lowercase kebab-case and equal to the directory name.
3. Keep relative links inside the skill directory so they resolve after copy.
4. Run `npx agentic-tools doctor` and require `ok`.

## Agents and CI

- [`AGENTS.md`](./AGENTS.md) is the canonical recipe for AI agents: bootstrap,
  `doctor --json` verification, how to attach a skill, and how to add one.

## Releasing

Releases are GitHub Release tarballs — no npm registry account or 2FA involved.
**Releases are automatic on merge:** bump `"version"` in
`agentic-tools/package.json`, commit, and merge to `main`. The
`Release agentic-tools` workflow creates the `agentic-tools-v<version>` tag and
GitHub Release. If the version was already released, the workflow is a no-op. You
do not push tags by hand.
