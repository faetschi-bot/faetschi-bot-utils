# agentic-tools

Reusable skills and slash commands (and, later, hooks) for AI coding agents.
Each skill is a `SKILL.md` with YAML frontmatter and a body of instructions an
agent loads when a task matches; each command is a markdown prompt installed as
a slash command in OpenCode, Pi, or Codex CLI. Installer guides are separate
upstream setup instructions, not installable agent skills. The pack is
language-agnostic: its skills and commands are text the agent reads, not
programs that run in your project.

## Tools/Skills/Commands

| Type | Tool/skill | Use it when |
|------|------------|-------------|
| Skill | [`agent-friendly-code`](./skills/agent-friendly-code/SKILL.md) | Writing or changing code, auditing a codebase for agent-hostile structure, or setting up a project's agent instruction file. Applies the read-time cost bar. |
| Skill | [`test-audit`](./skills/test-audit/SKILL.md) | Writing, changing, reviewing, or sweeping tests. Gates new tests at authoring time and audits existing tests for low-value, implementation-coupled, or duplicative coverage. |
| Skill | [`visual-recap`](./skills/visual-recap/SKILL.md) | Turning a PR, branch, commit, or diff into a visual recap. Pairs with `visual-shot recap` — the skill authors `recap.json`, the CLI renders it. |
| Skill | [`simple-english`](./skills/simple-english/SKILL.md) | Writing, rewriting, reviewing, or checking technical documentation in ASD-STE100 Simplified Technical English. |
| Command | [`catch-up`](./commands/catch-up.md) | Returning to a project and needing the branch state, in-progress work, and next step. |
| Command | [`clean-codebase-loop`](./commands/clean-codebase-loop.md) | Running an autonomous whole-codebase simplification loop that ends in a PR or set of PRs. |
| Command | [`craft-goal`](./commands/craft-goal.md) | Turning an idea or task into a clear, verifiable Goal through a guided dialogue. |
| Command | [`debug`](./commands/debug.md) | Investigating an issue to root cause before any fix is proposed. |
| Command | [`explore`](./commands/explore.md) | Getting a high-level orientation tour of an unfamiliar codebase. |
| Command | [`handoff-review`](./commands/handoff-review.md) | Producing a review handoff for another agent to review the work. |
| Command | [`plan-feature`](./commands/plan-feature.md) | Turning a feature idea into a concrete implementation plan through a guided dialogue. |
| Command | [`schedule-task`](./commands/schedule-task.md) | Defining a scheduled task (self-contained prompt, schedule, model) through a guided dialogue. |
| Command | [`summary`](./commands/summary.md) | Summarizing the current session, optionally focused on a topic. |
| Command | [`weigh`](./commands/weigh.md) | Comparing distinct approaches with trade-offs and a recommendation. |
| Command | [`workspace-review`](./commands/workspace-review.md) | Reviewing workspace changes for correctness, adequacy, and security. |
| Install guide (not a skill) | [`Plannotator`](./install/plannotator.md) | Installing Plannotator; its own installer adds supported agent integrations and skills. |
| Install guide (not a skill) | [`unsnooze`](./install/unsnooze.md) | Installing, configuring, verifying, or removing unsnooze for Claude Code or Codex CLI. |

## Requirements

- **Node 20+** — only to run the `agentic-tools` validator.
- An agent that can load skills or commands (e.g. OpenCode, Pi, Codex CLI).
  See [Use a skill](#use-a-skill) and [Use a command](#use-a-command).

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
agentic-tools list [--commands] [options]        list the skills (or commands) in this package
agentic-tools doctor [options]                   validate every SKILL.md and command, then exit
agentic-tools install <name...> [options]        copy skills (or commands) into an agent directory
agentic-tools install --all [options]            copy every skill (or command) in the pack
```

| Flag | Meaning |
|------|---------|
| `--root <path>` | package root to inspect (default: this package) |
| `--commands` | work with the commands pack instead of the skills pack |
| `--target <name>` | install preset: skills — `opencode` (default), `claude`, `agents`; commands — `opencode` (default), `pi`, `codex` |
| `--global` | install to the user-global dir instead of the project |
| `--dir <path>` | explicit destination dir (overrides `--target`/`--global`) |
| `--all` | select every skill or command in the pack |
| `--force` | overwrite existing skills or commands |
| `--dry-run` | report what would be installed without writing anything |
| `--json` | print a machine-readable result object |

`doctor` validates every `skills/*/SKILL.md`: frontmatter has a `name` that
matches the directory plus a non-empty `description`, and all relative links and
in-page anchors resolve. It validates every `commands/*.md`: a non-empty
`description` and a non-empty body with no unresolved `{{` template variables.
It exits non-zero on any problem, so CI and agents can verify the pack before
trusting it.

```bash
$ npx agentic-tools doctor --json
{
  "ok": true,
  "root": "/path/to/agentic-tools",
  "skills": [
    { "name": "agent-friendly-code", "ok": true, "errors": [], "warnings": [] },
    { "name": "test-audit", "ok": true, "errors": [], "warnings": [] }
  ],
  "commands": [
    { "name": "catch-up", "ok": true, "errors": [] }
  ]
}
```

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

### visual-recap

Turns a change that already exists into a reviewable visual artifact — a
self-contained HTML report (optionally a PNG) with a file map, annotated diffs,
diagrams, schema/API summaries, and real before/after screenshots.

- The skill is the **authoring** half: read the diff, decide what matters, and
  write a strict, versioned `recap.json` (file map, `diff`, `data-model`,
  `api-endpoint`, `callout`, `image-pair`, `mermaid`, `tabs`, and more).
- Rendering is the **`visual-shot` CLI's** `recap` command, which validates every
  block and bakes Mermaid SVG + syntax highlighting into an offline HTML file:

  ```bash
  npx visual-shot recap --from recap.json --out tmp/images/PRs/recap.html --png --json
  ```

- Pair it with real UI captures for the strongest review: `visual-shot --url …`
  before and after, referenced from an `image-pair` block.

The split is deliberate: the agent supplies judgment (what changed and why), and
a deterministic renderer supplies the artifact, so a recap can be reproduced and
diffed like any other file.

### simple-english

Vendored verbatim from
[0xpili/simplified-technical-english](https://github.com/0xpili/simplified-technical-english)
(renamed to `simple-english` for a shorter install name; MIT, and the ASD-STE100
word list stays ASD property — see the skill's `NOTICE.md`). It makes the agent
write and rewrite technical documentation in ASD-STE100 Simplified Technical
English: the verb, sentence, word, and safety rules, an 869-word approved list,
substitutions, before/after examples, and an optional `scripts/ste_check.py`
checker. Because the whole skill directory is copied, `install simple-english`
brings its references, examples, and script along; it is text plus one optional
Python 3 checker.

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

## Use a command

`install --commands <name...>` installs slash-command prompts, rendered into
each CLI's own command format; `install --all --commands` installs every
command in the pack. See [`commands/README.md`](./commands/README.md) for the
full list, the OpenChamber provenance, and the per-CLI mapping.

```bash
# OpenCode project commands: <project>/.opencode/commands/<name>.md -> /catch-up
npx agentic-tools install catch-up --commands

# Pi user prompts: ~/.pi/agent/prompts/<name>.md -> /catch-up
npx agentic-tools install catch-up --commands --target pi --global

# Codex CLI user skills: ~/.agents/skills/<name>/SKILL.md -> $catch-up
npx agentic-tools install clean-codebase-loop --commands --target codex --global
```

Command targets (project / global):

| Target | Project | Global | Written as |
|--------|---------|--------|------------|
| `opencode` (default) | `.opencode/commands` | `~/.config/opencode/commands` | `<name>.md` |
| `pi` | `.pi/prompts` | `~/.pi/agent/prompts` | `<name>.md` |
| `codex` | `.agents/skills` | `~/.agents/skills` | `<name>/SKILL.md` |

Commands carry the same guarantees as skills: the selection is validated before
anything is written, existing destinations are refused without `--force`, and
`--dry-run` and `--json` behave the same. Run `/reload` in Pi after installing
so the new prompt templates register.

## Adding a command

1. Create `commands/<name>.md` (lowercase kebab-case) with a `description`
   (plus an optional `argument-hint` for Pi) and a non-empty prompt body.
2. Resolve every template variable; `doctor` rejects a body containing `{{`.
3. Run `npx agentic-tools doctor` and require `ok`.

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
