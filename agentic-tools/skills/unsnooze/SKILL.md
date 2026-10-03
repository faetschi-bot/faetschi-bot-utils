---
name: unsnooze
description: "Invoke when the user wants to install, configure, verify, or troubleshoot unsnooze — the third-party CLI that auto-resumes Claude Code and Codex CLI sessions stopped by 5-hour or weekly usage limits. Also use when planning unattended or overnight agent runs that must survive a limit reset."
---

# unsnooze (usage-limit auto-resume)

[unsnooze](https://unsnooze.dev/docs/) is a third-party CLI (MIT, by
[@saaranshM](https://github.com/saaranshM/unsnooze)) that watches AI coding
sessions and wakes them when a usage limit resets. This pack uses it for
**Claude Code and Codex CLI only** — do not build a custom auto-resumer.

Source: <https://github.com/saaranshM/unsnooze> · Docs:
<https://unsnooze.dev/docs/>

## Requirements

- **Node >= 20.12** (macOS, Linux, Windows).
- Optional — **tmux >= 3.2**, Zellij, herdr >= 0.8, or cmux for resuming a live
  pane in place. Without a multiplexer unsnooze still works headless.

## Install and configure

```bash
npm install -g unsnooze
unsnooze setup      # wizard: select Claude Code + Codex only
```

`setup` writes shell wrappers into `~/.zshrc` / `~/.bashrc`, fish config, or the
PowerShell profile; installs the Claude `StopFailure` hook; optionally installs
the daemon (launchd/systemd user unit); and writes `~/.unsnooze/config.json`.
Open a new shell so the wrappers load.

After that, run `claude` and `codex` exactly as before — the wrapper runs them in
a watched pane, and nothing else is called.

## Verify

```bash
unsnooze doctor          # "all clear" means healthy; `doctor --fix` repairs
```

`doctor` reports problems, not a checklist. Require no `✗` before saying it works.

## Configure (optional)

```bash
unsnooze config set multiplexer tmux      # auto|tmux|zellij|herdr|cmux|headless
unsnooze config set autoResume true       # false = track only, never wake
unsnooze config set agents.claude on
unsnooze config set agents.codex on
unsnooze config set resumeMessage "Continue where you left off."
unsnooze config set workspaceGuard inform # repo changed while the session slept
unsnooze config set contextGuard inform   # warn when a wake re-reads big context
```

## Operate

```bash
unsnooze status          # tracked sessions + reset countdowns
unsnooze preview [id]    # dry-run: what would be typed, sends nothing
unsnooze resume-now [id|--all]
unsnooze cancel --all    # stop tracking every session
unsnooze uninstall       # remove every change (touched files are backed up)
```

## Guardrails

- It **injects keystrokes into your terminal**; it is a scheduler, not an
  auto-approver. It never passes `--dangerously-skip-permissions` and never
  selects "Upgrade your plan". Your agent's own permission model still governs
  what happens after a wake.
- **No telemetry.** State stays in `~/.unsnooze`. One daily npm version check
  (`updateCheck=false` disables it).
- Every file it edits is backed up; `unsnooze uninstall` reverses the install.
