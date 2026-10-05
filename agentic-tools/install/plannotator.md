# Install Plannotator

[Plannotator](https://github.com/backnotprop/plannotator) is a local browser
interface for reviewing agent plans, Markdown/HTML documents, and code changes.
It integrates with coding agents through hooks, plugins, skills, and commands.
This guide documents upstream installation; it does not contain or run
Plannotator itself.

## Install

Ask which setup the user wants before changing their machine. The full installer
auto-detects supported agents and configures their integrations; it downloads
the Plannotator binary and may contact GitHub, npm, and other upstream services.
Review the [upstream installation guide](https://docs.plannotator.ai/open-source/start/installation)
if the user needs a specific agent or platform.

For macOS, Linux, or WSL, the upstream full install is:

```bash
curl -fsSL https://plannotator.ai/install.sh | bash
```

For Windows PowerShell:

```powershell
irm https://plannotator.ai/install.ps1 | iex
```

If the user wants only the CLI binary and no agent hooks, skills, slash
commands, or per-agent configuration, use minimal mode:

```bash
curl -fsSL https://plannotator.ai/install.sh | bash -s -- --minimal
```

Do not run a remote script or make machine-wide configuration changes without
the user's authorization. For users who prefer inspection before execution,
direct them to review the installer at
<https://plannotator.ai/install.sh> and the upstream source repository.

## Use and verify

After installation, the user can try the commands for their agent, for example:

```text
/plannotator-review
/plannotator-annotate README.md
/plannotator-last
```

The upstream installer reports which integrations it configured. Verify the
binary is available with:

```bash
plannotator --help
```

Plannotator also supports `plannotator doctor` for installation diagnostics and
`plannotator uninstall` to remove recognized integrations. Consult upstream
documentation for platform-specific verification and cleanup details.

## Important behavior

- Plans, diffs, annotations, drafts, and configuration are local by default.
- The app checks GitHub for releases when its app surfaces load; local code
  review can query the configured Git remote. These checks do not upload local
  plan or diff content.
- URL annotation, PR/MR retrieval, AI features, and sharing can send the data
  needed by those features to their respective services. Review the upstream
  [privacy and network behavior](https://github.com/backnotprop/plannotator#privacy-and-network-behavior)
  before enabling them.
- This is an installation guide, not a skill. The Plannotator installer itself
  adds the agent integrations and skills it supports.
