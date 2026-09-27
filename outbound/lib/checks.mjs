import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeReleaseConfig } from './release-config.mjs';
import { readOutboundConfig } from './adoption.mjs';

export const RELEASE_CONFIG_PATHS = ['.github/release.yml', '.github/release.yaml'];
export const RELEASE_CONFIG_DEFAULT = '.github/release.yml';
export const WORKFLOWS_DIR = '.github/workflows';
export const RELEASE_MARKERS = /gh release create|action-gh-release|--generate-notes|generate_release_notes/;
// A workflow that creates a GitHub Release needs write access to repo contents.
const WRITE_PERMISSIONS = /contents:\s*['"]?write['"]?|permissions:\s*write-all/;

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

export function findReleaseWorkflows(dir) {
  const wfDir = join(dir, WORKFLOWS_DIR);
  if (!existsSync(wfDir)) return [];
  let entries;
  try {
    entries = readdirSync(wfDir);
  } catch {
    return [];
  }
  const found = [];
  for (const name of entries) {
    if (!/\.ya?ml$/.test(name)) continue;
    let text;
    try {
      text = readFileSync(join(wfDir, name), 'utf8');
    } catch {
      continue;
    }
    if (RELEASE_MARKERS.test(text)) found.push(`${WORKFLOWS_DIR}/${name}`);
  }
  return found;
}

export function findReleaseWorkflow(dir) {
  return findReleaseWorkflows(dir)[0] ?? null;
}

export function matchingTags(dir, prefix) {
  const r = git(dir, ['tag', '--list', `${prefix}*`, '--sort=-v:refname']);
  if (r.status !== 0) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function packageVersion(dir, packagePath) {
  if (!packagePath) return null;
  try {
    const value = JSON.parse(readFileSync(join(dir, packagePath), 'utf8'));
    return typeof value.version === 'string' ? value.version : null;
  } catch {
    return null;
  }
}

export function allTags(dir) {
  const r = git(dir, ['tag', '--list', '--sort=-v:refname']);
  if (r.status !== 0) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function detectTagPrefixes(tags) {
  const prefixes = new Set();
  for (const tag of tags) {
    const match = tag.match(/^(.*-v)(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/) ||
      tag.match(/^(v)(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/) ||
      tag.match(/^(.*?)(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
    if (match) prefixes.add(match[1]);
  }
  return [...prefixes].sort();
}

// Resolve the GitHub remote + default branch once, shared by the remote checks.
// Mirrors the old pr-only behavior: unavailable or unauthenticated gh is not a
// failure, it is a skip, so the tool is useful without network access.
export function githubContext(dir) {
  if (gh(dir, ['--version']).status !== 0) {
    return { ok: false, detail: 'gh not installed', hint: 'Install the GitHub CLI to run the remote checks.' };
  }
  const repo = gh(dir, ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  if (repo.status !== 0) {
    return { ok: false, detail: 'no GitHub remote, or gh not authenticated', hint: 'Run in a GitHub repo after: gh auth login' };
  }
  const branchRes = gh(dir, ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name']);
  const branch = branchRes.status === 0 && branchRes.stdout.trim() ? branchRes.stdout.trim() : 'main';
  return { ok: true, nwo: repo.stdout.trim(), branch };
}

export function checkPullRequestPolicy(dir, context) {
  let ctx = context;
  if (!ctx || !ctx.ok) {
    ctx = ctx || githubContext(dir);
    if (!ctx.ok) return { ok: true, skipped: true, detail: ctx.detail, hint: ctx.hint };
  }
  const protection = gh(dir, ['api', `repos/${ctx.nwo}/branches/${ctx.branch}/protection`]);
  if (protection.status === 0) {
    return { ok: true, skipped: false, detail: `${ctx.nwo}@${ctx.branch} is protected`, hint: '' };
  }
  const err = `${protection.stdout}\n${protection.stderr}`;
  if (/404|branch not protected|not found/i.test(err)) {
    return {
      ok: false,
      skipped: false,
      detail: `${ctx.nwo}@${ctx.branch} has no branch protection`,
      hint: `Require pull requests on ${ctx.branch} so history stays PR-based.`,
    };
  }
  return {
    ok: true,
    skipped: true,
    detail: 'cannot read branch protection (needs admin)',
    hint: `Verify manually that ${ctx.branch} requires pull requests.`,
  };
}

const GENERIC_TITLES =
  /^(wip|misc|miscellaneous|update|updates|change|changes|fix|fixes|bugfix|hotfix|cleanup|clean-up|refactor|tmp|temp|test|tests|stuff|things)\.?$/i;
const BRANCH_NAME_TITLE = /^(feat|feature|fix|bug|chore|docs|doc|hotfix|release|refactor)\//i;

// A PR title is the changelog line, so some titles are unusable by definition.
export function isUnusablePrTitle(pr) {
  const title = String(pr?.title ?? '').trim();
  if (!title) return true;
  if (/^(merge|merging)\b/i.test(title)) return true;
  if (GENERIC_TITLES.test(title)) return true;
  if (pr?.headRefName && title.toLowerCase() === String(pr.headRefName).toLowerCase()) return true;
  if (BRANCH_NAME_TITLE.test(title)) return true;
  if (/wip\.?$/i.test(title)) return true;
  return false;
}

function readReleaseConfig(dir) {
  const configPath = findReleaseConfig(dir);
  if (!configPath) return { configPath: null, analysis: null };
  let analysis;
  try {
    analysis = analyzeReleaseConfig(readFileSync(join(dir, configPath), 'utf8'));
  } catch (e) {
    analysis = { ok: false, errors: [e.message], categories: [], labels: [], excludeLabels: [] };
  }
  return { configPath, analysis };
}

export function runChecks({ dir, tagPrefix, packagePath, noRemote = false, releaseBranch } = {}) {
  const checks = [];
  const add = (name, ok, detail, hint = '', skipped = false, severity = 'error') => checks.push({ name, ok, detail, hint, skipped, severity });
  const skip = (name, detail, hint = '') => checks.push({ name, ok: true, detail, hint, skipped: true, severity: 'info' });

  const inRepo = isGitRepo(dir);
  add('git-repo', inRepo, inRepo ? dir : 'not a git work tree', 'Run outbound inside a git repository.');
  if (!inRepo) return { ok: false, checks };

  const stored = readOutboundConfig(dir);
  if (stored.error) add('outbound-config', false, stored.error, 'Fix or remove .outbound.json.');
  const configuredPrefix = tagPrefix ?? stored.config.tagPrefix;
  const detectedPrefixes = detectTagPrefixes(allTags(dir));
  const effectivePrefix = configuredPrefix ?? (detectedPrefixes.length === 1 ? detectedPrefixes[0] : undefined);
  const effectivePackage = packagePath ?? stored.config.package;
  const effectiveBranch = releaseBranch ?? stored.config.releaseBranch;
  if (stored.config.releaseBranch && effectiveBranch) {
    add('release-branch', true, `configured release branch: ${effectiveBranch}`, '', false, 'info');
  }
  if (!configuredPrefix && detectedPrefixes.length === 1) {
    add('tag-prefix', true, `auto-detected tag prefix: ${detectedPrefixes[0] || '(empty)'}`, '', false, 'info');
  } else if (!configuredPrefix && detectedPrefixes.length > 1) {
    add('tag-prefix', false, `multiple tag prefixes found: ${detectedPrefixes.join(', ')}`, 'Set --tag-prefix or run outbound setup --tag-prefix <prefix> for the package being released.', false, 'warning');
  }

  const { configPath, analysis } = readReleaseConfig(dir);
  add('release-config', Boolean(configPath), configPath || 'no .github/release.yml', 'Run: outbound init');
  if (configPath) {
    add(
      'release-config-valid',
      analysis.ok,
      analysis.ok ? `${analysis.categories.length} category(ies), catch-all present` : analysis.errors[0],
      analysis.ok ? '' : analysis.errors.join(' '),
    );
  } else {
    skip('release-config-valid', 'no config to validate');
  }

  const workflows = findReleaseWorkflows(dir);
  const workflow = workflows[0] ?? null;
  add(
    'release-workflow',
    Boolean(workflow),
    workflow || 'no workflow that creates releases',
    'Add a workflow that runs "gh release create --generate-notes" on merge.',
  );
  if (workflows.length > 0) {
    const offenders = workflows.filter((p) => {
      try {
        return !WRITE_PERMISSIONS.test(readFileSync(join(dir, p), 'utf8'));
      } catch {
        return true;
      }
    });
    add(
      'release-workflow-write',
      offenders.length === 0,
      offenders.length
        ? `${offenders.join(', ')} do not grant "contents: write"`
        : `${workflows.length} release workflow(s) grant "contents: write"`,
      offenders.length ? 'Add a "contents: write" permission so the release step can create the GitHub Release.' : '',
    );
  } else {
    skip('release-workflow-write', 'no release workflow to inspect');
  }

  if (effectivePrefix) {
    const tags = matchingTags(dir, effectivePrefix);
    add(
      'tag-scheme',
      tags.length > 0,
      tags.length ? `${tags.length} tag(s), latest ${tags[0]}` : `no tags matching ${effectivePrefix}*`,
      `Tag releases as ${effectivePrefix}<version>.`,
      false,
      effectivePrefix ? 'warning' : 'error',
    );
    const version = packageVersion(dir, effectivePackage);
    if (effectivePackage && !version) add('package-version', false, `cannot read a version from ${effectivePackage}`, 'Set packagePath to a version file with a string version.', false, 'error');
    else if (version) {
      const expected = `${effectivePrefix}${version}`;
      add('package-tag', tags.includes(expected), tags.includes(expected) ? `${effectivePackage} ${version} -> ${expected}` : `expected release tag ${expected} does not exist`, `Release ${effectivePackage} version ${version} as ${expected}.`, false, 'warning');
    }
    const all = allTags(dir);
    const unrelated = all.filter((tag) => !tag.startsWith(effectivePrefix));
    const workflows = findReleaseWorkflows(dir);
    const scoped = workflows.length > 0 && workflows.every((path) => readFileSync(join(dir, path), 'utf8').includes('--notes-start-tag'));
    add('tag-safety', unrelated.length === 0 || scoped, unrelated.length === 0 ? `all tags use ${effectivePrefix}` : scoped ? `${unrelated.length} other tag family/families found; workflows pin --notes-start-tag` : `${unrelated.length} tag(s) use another prefix and release notes may include unrelated PRs`, scoped ? '' : 'Use --notes-start-tag with the previous tag for this package (setup scaffolds it).', false, 'warning');
  }

  if (noRemote) {
    skip('release-labels', 'disabled by --no-remote', 'Re-run without --no-remote (needs: gh auth login).');
    skip('pr-titles', 'disabled by --no-remote', 'Re-run without --no-remote (needs: gh auth login).');
    skip('pr-only', 'disabled by --no-remote', 'Re-run without --no-remote (needs: gh auth login).');
    return { ok: checks.filter((c) => c.severity !== 'warning' && c.severity !== 'info').every((c) => c.ok), checks };
  }

  const ctx = githubContext(dir);
  if (!ctx.ok) {
    skip('release-labels', ctx.detail, ctx.hint);
    skip('pr-titles', ctx.detail, ctx.hint);
  } else {
    addReleaseLabelsCheck(dir, ctx, configPath, analysis, add, skip);
    addPrTitlesCheck(dir, ctx, add, skip);
  }

  const pr = checkPullRequestPolicy(dir, ctx);
  add('pr-only', pr.ok, pr.detail, pr.hint, pr.skipped);

  return { ok: checks.filter((c) => c.severity !== 'warning' && c.severity !== 'info').every((c) => c.ok), checks };
}

function addReleaseLabelsCheck(dir, ctx, configPath, analysis, add, skip) {
  if (!configPath || !analysis || !analysis.ok) {
    skip('release-labels', 'release config missing or invalid');
    return;
  }
  const referenced = [...new Set([...analysis.labels, ...analysis.excludeLabels])].filter((l) => l && l !== '*');
  if (referenced.length === 0) {
    skip('release-labels', 'no labels referenced in the config');
    return;
  }
  const listed = gh(dir, ['label', 'list', '-R', ctx.nwo, '--limit', '200', '--json', 'name', '-q', '.[].name']);
  if (listed.status !== 0) {
    skip('release-labels', 'could not list repo labels', 'Check gh authentication and access.');
    return;
  }
  const have = new Set(listed.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
  const missing = referenced.filter((l) => !have.has(l));
  add(
    'release-labels',
    missing.length === 0,
    missing.length
      ? `labels not on the repo: ${missing.join(', ')}`
      : `${referenced.length} referenced label(s) exist on the repo`,
    missing.length ? 'Create them so those PRs are not silently dropped into "Other Changes" (Settings -> Labels).' : '',
  );
}

function addPrTitlesCheck(dir, ctx, add, skip) {
  const prs = gh(dir, [
    'pr',
    'list',
    '-R',
    ctx.nwo,
    '--state',
    'merged',
    '--limit',
    '10',
    '--json',
    'number,title,headRefName',
  ]);
  if (prs.status !== 0) {
    skip('pr-titles', 'could not list merged PRs', 'Check gh authentication and access.');
    return;
  }
  let parsed = [];
  try {
    parsed = JSON.parse(prs.stdout);
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    add('pr-titles', true, 'no merged PRs to inspect');
    return;
  }
  const bad = parsed.filter(isUnusablePrTitle);
  add(
    'pr-titles',
    bad.length === 0,
    bad.length
      ? `${bad.length}/${parsed.length} recent merged PR titles are not changelog lines: ${bad
          .map((p) => `#${p.number} "${p.title}"`)
          .join(', ')}`
      : `${parsed.length} recent merged PR titles look usable`,
    'Write titles as the user-facing changelog line (see the one rule in AGENTS.md).',
  );
}

export function writeReleaseConfig(dir, { force = false } = {}) {
  const existing = findReleaseConfig(dir);
  if (existing && !force) return { written: false, path: existing, existed: true };
  mkdirSync(join(dir, '.github'), { recursive: true });
  writeFileSync(join(dir, RELEASE_CONFIG_DEFAULT), releaseConfigTemplate());
  return { written: true, path: RELEASE_CONFIG_DEFAULT, existed: Boolean(existing) };
}
