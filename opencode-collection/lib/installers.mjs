// The installers this tool delegates to, and how to invoke each one. This
// module is the single source of truth: catalog validation, command planning,
// and PATH detection all derive from it, so adding an installer is one entry.
//
// Command shapes come from the tools' own docs, not from guessing:
//   opencode  https://opencode.ai/v2/docs/cli/plugins (opencode plugin add <spec>)
//             OpenCode's own plugin manager. It is the native path for package
//             plugins and writes the config format for the running version.
//   npx       https://docs.npmjs.com/cli/commands/npx (npx -y <spec> <args>)
//             Runs a plugin's own installer. Some plugins need it to configure
//             more than a plugin entry — for example a model catalog or a TUI
//             component — so the catalog declares their args.
export const INSTALLERS = {
  opencode: {
    command: 'opencode',
    // OpenCode's plugin manager takes no extra arguments here.
    acceptsArgs: false,
    buildArgs: ({ spec }) => ['plugin', 'add', spec],
  },
  npx: {
    command: 'npx',
    acceptsArgs: true,
    buildArgs: ({ spec, args = [] }) => ['-y', spec, ...args],
  },
};

export const INSTALLER_NAMES = Object.keys(INSTALLERS);
