import { existsSync, readFileSync } from 'node:fs';

// The packaged agent skill lives at skills/<name>/SKILL.md and is validated the
// same way agentic-tools validates its skills: name matches the directory and
// description is non-empty and within the spec limit.
export const SKILL_NAME = 'session-search';
export const MAX_DESCRIPTION = 1024;
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const data = {};
  for (const raw of text.slice(3, end).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[match[1]] = value;
  }
  return data;
}

export function validateSkillFile(file, expectedName = SKILL_NAME) {
  if (!existsSync(file)) return { ok: false, errors: ['missing SKILL.md'] };
  const data = parseFrontmatter(readFileSync(file, 'utf8'));
  const errors = [];
  if (!data.name) errors.push('missing "name"');
  else if (data.name !== expectedName) errors.push(`name "${data.name}" does not match "${expectedName}"`);
  else if (!NAME_RE.test(data.name)) errors.push('name must be lowercase kebab-case');
  if (!data.description) errors.push('missing "description"');
  else if (data.description.length > MAX_DESCRIPTION) {
    errors.push(`description is ${data.description.length} chars (max ${MAX_DESCRIPTION})`);
  }
  return { ok: errors.length === 0, errors, name: data.name, description: data.description };
}
