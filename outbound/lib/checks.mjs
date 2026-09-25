import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RELEASE_CONFIG_PATHS = ['.github/release.yml', '.github/release.yaml'];
export const RELEASE_CONFIG_DEFAULT = '.github/release.yml';
export const WORKFLOWS_DIR = '.github/workflows';
export const RELEASE_MARKERS = /gh release create|action-gh-release|--generate-notes|generate_release_notes/;

export function releaseConfigTemplate() {
  return `# .github/release.yml - shapes the auto-generated GitHub Release notes.
# Docs: https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes
changelog:
  exclude:
    labels:
      - ignore-for-release
    authors:
      - dependabot[bot]
  categories:
    - title: Breaking Changes
      labels:
        - breaking-change
        - semver-major
    - title: Features
      labels:
        - enhancement
        - feature
        - semver-minor
    - title: Fixes
      labels:
        - bug
        - fix
    - title: Other Changes
      labels:
        - "*"
`;
}

function git(dir, args) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}

function gh(dir, args) {
  return spawnSync('gh', args, { cwd: dir, encoding: 'utf8', env: process.env });
}

export function isGitRepo(dir) {
  const r = git(dir, ['rev-parse', '--is-inside-work-tree']);
  return r.status === 0 && r.stdout.trim() === 'true';
}

export function repoRoot(dir) {
  const r = git(dir, ['rev-parse', '--show-toplevel']);
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : dir;
}

export function findReleaseConfig(dir) {
  for (const path of RELEASE_CONFIG_PATHS) {
    if (existsSync(join(dir, path))) return path;
  }
  return null;
}

export function findReleaseWorkflow(dir) {
  const wfDir = join(dir, WORKFLOWS_DIR);
  if (!existsSync(wfDir)) return null;
  let entries;
  try {
    entries = readdirSync(wfDir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (!/\.ya?ml$/.test(name)) continue;
    let text;
    try {
      text = readFileSync(join(wfDir, name), 'utf8');
    } catch {
      continue;
    }
    if (RELEASE_MARKERS.test(text)) return `${WORKFLOWS_DIR}/${name}`;
  }
  return null;
}

export function matchingTags(dir, prefix) {
  const r = git(dir, ['tag', '--list', `${prefix}*`, '--sort=-v:refname']);
  if (r.status !== 0) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function checkPullRequestPolicy(dir) {
  const version = gh(dir, ['--version']);
  if (version.status !== 0) {
    return {
      ok: true,
      skipped: true,
      detail: 'gh not installed',
      hint: 'Install the GitHub CLI to verify branch protection.',
    };
  }
  const repo = gh(dir, ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  if (repo.status !== 0) {
    return {
      ok: true,
      skipped: true,
      detail: 'no GitHub remote, or gh not authenticated',
      hint: 'Run in a GitHub repo after: gh auth login',
    };
  }
  const nwo = repo.stdout.trim();
  const branchRes = gh(dir, ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name']);
  const branch = branchRes.status === 0 && branchRes.stdout.trim() ? branchRes.stdout.trim() : 'main';
  const protection = gh(dir, ['api', `repos/${nwo}/branches/${branch}/protection`]);
  if (protection.status === 0) {
    return { ok: true, skipped: false, detail: `${nwo}@${branch} is protected`, hint: '' };
  }
  const err = `${protection.stdout}\n${protection.stderr}`;
  if (/404|branch not protected|not found/i.test(err)) {
    return {
      ok: false,
      skipped: false,
      detail: `${nwo}@${branch} has no branch protection`,
      hint: `Require pull requests on ${branch} so history stays PR-based.`,
    };
  }
  return {
    ok: true,
    skipped: true,
    detail: 'cannot read branch protection (needs admin)',
    hint: `Verify manually that ${branch} requires pull requests.`,
  };
}

export function runChecks({ dir, tagPrefix } = {}) {
  const checks = [];
  const add = (name, ok, detail, hint = '', skipped = false) =>
    checks.push({ name, ok, detail, hint, skipped });

  const inRepo = isGitRepo(dir);
  add('git-repo', inRepo, inRepo ? dir : 'not a git work tree', 'Run outbound inside a git repository.');
  if (!inRepo) return { ok: false, checks };

  const config = findReleaseConfig(dir);
  add('release-config', Boolean(config), config || 'no .github/release.yml', 'Run: outbound init');

  const workflow = findReleaseWorkflow(dir);
  add(
    'release-workflow',
    Boolean(workflow),
    workflow || 'no workflow that creates releases',
    'Add a workflow that runs "gh release create --generate-notes" on merge.',
  );

  if (tagPrefix) {
    const tags = matchingTags(dir, tagPrefix);
    add(
      'tag-scheme',
      tags.length > 0,
      tags.length ? `${tags.length} tag(s), latest ${tags[0]}` : `no tags matching ${tagPrefix}*`,
      `Tag releases as ${tagPrefix}<version>.`,
    );
  }

  const pr = checkPullRequestPolicy(dir);
  add('pr-only', pr.ok, pr.detail, pr.hint, pr.skipped);

  return { ok: checks.every((c) => c.ok), checks };
}

export function writeReleaseConfig(dir, { force = false } = {}) {
  const existing = findReleaseConfig(dir);
  if (existing && !force) return { written: false, path: existing, existed: true };
  mkdirSync(join(dir, '.github'), { recursive: true });
  writeFileSync(join(dir, RELEASE_CONFIG_DEFAULT), releaseConfigTemplate());
  return { written: true, path: RELEASE_CONFIG_DEFAULT, existed: Boolean(existing) };
}
