import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_DESCRIPTION, SKILL_NAME, parseFrontmatter, validateSkillFile } from '../lib/skill.mjs';

const skillFile = fileURLToPath(new URL('../skills/session-search/SKILL.md', import.meta.url));

test('the packaged skill has valid frontmatter', () => {
  const result = validateSkillFile(skillFile, SKILL_NAME);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.name, 'session-search');
  assert.ok(result.description.length > 40);
  assert.ok(result.description.length <= MAX_DESCRIPTION);
});

test('parseFrontmatter reads quoted values and ignores comments', () => {
  const data = parseFrontmatter('---\nname: x\n# comment\ndescription: "a: b"\n---\nbody');
  assert.equal(data.name, 'x');
  assert.equal(data.description, 'a: b');
});

test('validateSkillFile reports missing fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-search-skill-'));
  try {
    const file = join(dir, 'SKILL.md');
    writeFileSync(file, '---\nname: other\n---\n\nbody\n');
    const result = validateSkillFile(file, 'session-search');
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /does not match/.test(error)));
    assert.ok(result.errors.some((error) => /missing "description"/.test(error)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
