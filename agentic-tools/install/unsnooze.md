# Install and configure unsnooze

[unsnooze](https://unsnooze.dev/docs/) is a third-party CLI that watches AI
coding sessions and wakes them when usage limits reset. It supports Claude Code
and Codex CLI.

## Requirements

- Node.js >= 20.12 (macOS, Linux, Windows).
- Optional: tmux >= 3.2, Zellij, herdr >= 0.8, or cmux to resume a live pane.
  Without a multiplexer, unsnooze still works headless.

## Install

Ask the user before installing software or changing shell and agent
configuration. The setup wizard can add shell wrappers, a Claude `StopFailure`
hook, an optional launchd/systemd user daemon, and `~/.unsnooze/config.json`.

```bash
npm install -g unsnooze
unsnooze setup
```

In the wizard, select Claude Code and Codex CLI as needed. Open a new shell after
setup so shell wrappers load. The wrappers run those CLIs in a watched pane.

## Verify

```bash
unsnooze doctor
```

Require no `✗` diagnostics before reporting a healthy setup. Use
`unsnooze doctor --fix` only when the user authorizes the suggested repairs.

## Configure and operate

```bash
unsnooze config set multiplexer tmux      # auto|tmux|zellij|herdr|cmux|headless
unsnooze config set autoResume true       # false = track only, never wake
unsnooze config set agents.claude on
unsnooze config set agents.codex on
unsnooze config set resumeMessage "Continue where you left off."
unsnooze config set workspaceGuard inform # repo changed while the session slept
unsnooze config set contextGuard inform   # warn when a wake re-reads big context
```

```bash
unsnooze status
unsnooze preview [id]       # dry-run: shows what would be typed, sends nothing
unsnooze resume-now [id|--all]
unsnooze cancel --all
unsnooze uninstall           # removes recognized changes; touched files are backed up
```

## Safety notes

- unsnooze injects keystrokes into a terminal; it is a scheduler, not an
  auto-approver. The agent's own permission model still governs actions after a
  wake.
- State stays in `~/.unsnooze`. The CLI performs one daily npm version check;
  `updateCheck=false` disables it.
- Setup backs up files it edits, and `unsnooze uninstall` reverses recognized
  installation changes. Review upstream docs for current behavior and details.

Source: <https://github.com/saaranshM/unsnooze> · Docs:
<https://unsnooze.dev/docs/>
