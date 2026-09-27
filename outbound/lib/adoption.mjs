import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const OUTBOUND_CONFIG = '.outbound.json';

export function readOutboundConfig(dir) {
  const path = join(dir, OUTBOUND_CONFIG);
  if (!existsSync(path)) return { path, config: {} };
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('must be a JSON object');
    return { path, config: value };
  } catch (error) {
    return { path, config: {}, error: `invalid ${OUTBOUND_CONFIG}: ${error.message}` };
  }
}

export function writeOutboundConfig(dir, config, { force = false } = {}) {
  const { path } = readOutboundConfig(dir);
  if (existsSync(path) && !force) return { written: false, path, existed: true };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return { written: true, path, existed: false };
}

export function releaseWorkflowTemplate({ releaseBranch = 'main', tagPrefix = 'v', packagePath = 'package.json' } = {}) {
  const packageDir = dirname(packagePath) === '.' ? '.' : dirname(packagePath);
  // The step runs in packageDir, so the version file is always package.json
  // relative to that working directory (including monorepo packages).
  const versionExpr = `require('./package.json')`;
  const tagExpr = `"${tagPrefix}"$(node -p "${versionExpr}.version")`;
  return [
    'name: Release', '', 'on:', '  push:', `    branches: [${releaseBranch}]`, '  workflow_dispatch:', '',
    'permissions:', '  contents: write', '', 'jobs:', '  release:', '    runs-on: ubuntu-latest', '    steps:',
    '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', "        with:", "          node-version: '20'",
    '      - name: Publish if the version is new', `        working-directory: ${packageDir}`, '        env:',
    '          GH_TOKEN: ${{ github.token }}', `          TAG_PREFIX: '${tagPrefix}'`, '        run: |',
    '          set -euo pipefail', `          tag=${tagExpr}`, '          gh release view "$tag" >/dev/null 2>&1 && exit 0',
    `          previous=$(git tag --list "${tagPrefix}*" --sort=-v:refname | head -n 1 || true)`,
    '          args=("$tag" --target "$GITHUB_SHA" --title "$tag" --generate-notes)',
    '          if [ -n "$previous" ] && [ "$previous" != "$tag" ]; then',
    '            args+=(--notes-start-tag "$previous")', '          fi', '          gh release create "${args[@]}"', '',
  ].join('\n');
}
export function labelsScript(labels = ['breaking-change', 'semver-major', 'enhancement', 'feature', 'semver-minor', 'bug', 'fix', 'ignore-for-release']) {
  return `#!/usr/bin/env bash
set -euo pipefail

# Creates the labels referenced by .github/release.yml. Run from the repository root.
command -v gh >/dev/null || { echo 'outbound labels: gh CLI is required' >&2; exit 1; }
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
for label in ${labels.map((label) => `'${label}'`).join(' ')}; do
  gh label create "$label" --repo "$repo" --color ededed --force >/dev/null
  echo "ensured $label"
done
`;
}

export function scaffoldSetup(dir, options = {}) {
  const stored = readOutboundConfig(dir);
  const config = {
    releaseBranch: options.releaseBranch ?? stored.config.releaseBranch ?? 'main',
    tagPrefix: options.tagPrefix ?? stored.config.tagPrefix ?? 'v',
    package: options.packagePath ?? stored.config.package ?? 'package.json',
    workflow: options.workflow ?? stored.config.workflow ?? '.github/workflows/release.yml',
  };
  const files = [];
  const configResult = writeOutboundConfig(dir, config, options);
  if (configResult.written) files.push(OUTBOUND_CONFIG);

  const releaseConfig = join(dir, '.github/release.yml');
  if (!existsSync(releaseConfig) || options.force) {
    mkdirSync(dirname(releaseConfig), { recursive: true });
    // The caller writes the actual release config to avoid a circular import.
  }
  const workflow = join(dir, config.workflow);
  if (!existsSync(workflow) || options.force) {
    mkdirSync(dirname(workflow), { recursive: true });
    writeFileSync(workflow, releaseWorkflowTemplate({ ...config, packagePath: config.package }));
    files.push(config.workflow);
  }
  const labelsPath = join(dir, '.github/outbound-labels.sh');
  if (!existsSync(labelsPath) || options.force) {
    mkdirSync(dirname(labelsPath), { recursive: true });
    writeFileSync(labelsPath, labelsScript());
    chmodSync(labelsPath, 0o755);
    files.push('.github/outbound-labels.sh');
  }
  return { config, files, configResult };
}
