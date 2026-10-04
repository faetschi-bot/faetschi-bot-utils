// The harnesses this tool installs for, and how to invoke each one's native
// package manager. This module is the single source of truth: catalog
// validation, --harness parsing, and PATH detection all derive from it, so
// adding a harness is one entry in INSTALLERS.
//
// Command shapes come from the harness docs, not from guessing:
//   pi   https://pi.dev/docs/latest (pi install <source>, --local -> .pi/settings.json)
//   omp  ubranch/omp-you-should-know README (omp plugin install github:...)
export const INSTALLERS = {
  pi: {
    command: 'pi',
    supportsLocal: true,
    buildArgs: ({ spec, local }) => ['install', spec, ...(local ? ['--local'] : [])],
  },
  omp: {
    command: 'omp',
    // OMP installs plugins for the user. No local scope is documented, so this
    // tool will not invent a flag for one.
    supportsLocal: false,
    buildArgs: ({ spec }) => ['plugin', 'install', spec],
  },
};

export const HARNESSES = Object.keys(INSTALLERS);
