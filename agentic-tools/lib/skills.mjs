import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

export const SKILLS_DIR = 'skills';
export const MAX_DESCRIPTION = 1024;
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function listSkillDirs(root) {
  const dir = join(root, SKILLS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      dir: join(dir, entry.name),
      file: join(dir, entry.name, 'SKILL.md'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseFrontmatter(text) {
  const errors = [];
  const data = {};
  if (!text.startsWith('---')) {
    errors.push('missing YAML frontmatter (file must start with ---)');
    return { data, errors };
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    errors.push('unterminated frontmatter (no closing ---)');
    return { data, errors };
  }
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
  return { data, errors };
}

export function relativeLinks(text) {
  const links = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    links.push(href);
  }
  return links;
}

export function validateSkill(skill) {
  const errors = [];
  const warnings = [];
  if (!existsSync(skill.file)) {
    return { name: skill.name, ok: false, errors: ['missing SKILL.md'], warnings };
  }
  const text = readFileSync(skill.file, 'utf8');
  const parsed = parseFrontmatter(text);
  errors.push(...parsed.errors);

  if (!parsed.data.name) errors.push('frontmatter: missing "name"');
  else if (parsed.data.name !== skill.name) {
    errors.push(`frontmatter name "${parsed.data.name}" does not match directory "${skill.name}"`);
  } else if (!NAME_RE.test(parsed.data.name)) {
    errors.push(`name "${parsed.data.name}" must be lowercase kebab-case`);
  }

  if (!parsed.data.description) errors.push('frontmatter: missing "description"');
  else if (parsed.data.description.length > MAX_DESCRIPTION) {
    errors.push(`description is ${parsed.data.description.length} chars (max ${MAX_DESCRIPTION})`);
  }

  const skillDir = resolve(skill.dir);
  for (const href of relativeLinks(text)) {
    const target = href.split('#')[0];
    if (!target) continue;
    const abs = resolve(dirname(skill.file), target);
    if (abs !== skillDir && !abs.startsWith(skillDir + sep)) {
      warnings.push(`link escapes the skill directory: ${href}`);
      continue;
    }
    if (!existsSync(abs)) errors.push(`broken relative link: ${href}`);
  }

  return { name: skill.name, ok: errors.length === 0, errors, warnings };
}

export function validateAll(root) {
  const skills = listSkillDirs(root).map(validateSkill);
  return { ok: skills.length > 0 && skills.every((skill) => skill.ok), skills };
}
