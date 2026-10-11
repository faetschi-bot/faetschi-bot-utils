# Commands

Reusable slash-command prompts, installed by `agentic-tools install <name>
--commands`. Each file is one command: YAML frontmatter with a `description`
(and an optional pi `argument-hint`) plus a prompt body.

Ten commands are a **1:1 port of OpenChamber's built-in magic prompts**
([openchamber/openchamber](https://github.com/openchamber/openchamber), MIT).
Source of truth: `packages/ui/src/lib/magicPrompts.ts` (the templates) and
`packages/ui/src/components/chat/composer/submit/slashCommands.ts` (the command
list). Every prompt part is copied verbatim; `clean-codebase-loop` is the only
command written for this pack.

## How the port maps onto each CLI

OpenChamber sends each command as two parts — a *visible* message the user sees
and *hidden* instructions attached as synthetic context. The target CLIs have a
single prompt per command, so each file is the visible prompt followed by the
instructions, in that order. Nothing else about the text changes:

| OpenChamber | Portable form |
|-------------|---------------|
| `/catch-up` | `catch-up.md` |
| `/workspace-review` | `workspace-review.md` |
| `/plan-feature` | `plan-feature.md` |
| `/craft-goal` | `craft-goal.md` |
| `/schedule-task` | `schedule-task.md` |
| `/debug` | `debug.md` |
| `/weigh` | `weigh.md` |
| `/explore` | `explore.md` |
| `/summary` | `summary.md` |
| `/handoff-review` | `handoff-review.md` |

OpenChamber fills template variables when the command runs (`/craft-goal
<idea>` weaves the idea into the visible message; `/summary <topic>` focuses the
summary). The target CLIs have no such variables, so those commands carry a
bridge sentence that tells the agent to treat text supplied with the invocation
as the argument. Text typed after the command reaches the prompt in every
target: OpenCode appends it after a blank line when the template has no
placeholder, Pi expands the `$@` trailer the installer adds, and Codex delivers
the user's message alongside the invoked skill.

OpenChamber's *application* commands are not portable as prompts and are
deliberately not in this pack: `/btw`, `/fork`, `/compact`, `/undo`, `/redo`,
and `/timeline` manipulate session state or open UI. `/handoff-review` is here
because its deliverable is the handoff text itself; forwarding that handoff to
a separate review session is OpenChamber session plumbing — run the command,
then start a reviewer with the handoff.

## What the installer writes per CLI

| Target | Location | Shape |
|--------|----------|-------|
| OpenCode | `.opencode/commands/` or `~/.config/opencode/commands/` | `<name>.md` |
| Pi | `.pi/prompts/` or `~/.pi/agent/prompts/` | `<name>.md` with `argument-hint` and a `$@` trailer |
| Codex CLI | `.agents/skills/` (project or `~`) | `<name>/SKILL.md` with `name` frontmatter |

Invoke as `/catch-up` in OpenCode and Pi; in Codex CLI use `/skills` or type
`$catch-up`.

## Adding a command

1. Create `commands/<name>.md` (lowercase kebab-case) with a `description` and
   a non-empty body.
2. Resolve every template variable — `doctor` rejects a body containing `{{`.
3. Run `npx agentic-tools doctor` and require `ok`.
