import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubRemote } from '../lib/repo.mjs';

test('parses GitHub remotes in every supported form', () => {
  assert.equal(parseGitHubRemote('git@github.com:owner/repo.git').slug, 'owner/repo');
  assert.equal(parseGitHubRemote('ssh://git@github.com/owner/repo.git').slug, 'owner/repo');
  assert.equal(parseGitHubRemote('https://github.com/owner/repo').slug, 'owner/repo');
  assert.equal(parseGitHubRemote('http://github.com/owner/repo.git').slug, 'owner/repo');
});

test('rejects non-GitHub or spoofed remotes', () => {
  assert.equal(parseGitHubRemote('https://evil.example/github.com/a/b'), null);
  assert.equal(parseGitHubRemote('https://gitlab.com/a/b'), null);
  assert.equal(parseGitHubRemote('not a url'), null);
  assert.equal(parseGitHubRemote(''), null);
});
