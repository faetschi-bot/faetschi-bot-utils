// The installers this tool delegates to, and how to invoke each one. This
// module is the single source of truth: catalog validation, command planning,
// and PATH detection all derive from it, so adding an installer is one entry.
//
// Command shape comes from the upstream docs, not from guessing:
//   opencode  https://opencode.ai/v2/docs/cli/plugins
//             `opencode plugin add <spec>` installs a package plugin and adds
//             it to the global configuration. It is the OpenCode-native path
//             and handles both opencode.json and opencode.jsonc.
export const INSTALLERS = {
  opencode: {
    command: 'opencode',
    // OpenCode's plugin manager installs global package plugins. No project or
    // local scope is documented, so this tool does not invent a flag for one.
    buildArgs: ({ spec }) => ['plugin', 'add', spec],
  },
};

export const INSTALLER_NAMES = Object.keys(INSTALLERS);
