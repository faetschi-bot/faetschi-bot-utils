import { readFileSync } from 'node:fs';

// Read once at load: the CLI and doctor both report the package version.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const PACKAGE_NAME = pkg.name;
export const PACKAGE_VERSION = pkg.version;
