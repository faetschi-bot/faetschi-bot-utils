// Contract between the recap author (an agent following the visual-recap skill)
// and the deterministic renderer. Kept intentionally small and strict: the
// renderer must build the report mechanically from this JSON, never infer.

export const RECAP_SCHEMA_VERSION = 1;

export const BLOCK_TYPES = new Set([
  'file-tree',
  'diff',
  'patch',
  'image',
  'image-pair',
  'mermaid',
  'diagram',
  'data-model',
  'api-endpoint',
  'callout',
  'table',
  'checklist',
  'notes',
  'code',
  'annotated-code',
  'columns',
  'tabs',
]);

const CONTAINER_TYPES = new Set(['columns', 'tabs']);

function isStr(value) {
  return typeof value === 'string' && value.length > 0;
}

function isArr(value) {
  return Array.isArray(value);
}

// Each entry returns a list of human-readable problems for one block, given the
// block's path (e.g. `blocks[2]`) for locatable error messages.
const BLOCK_CHECKS = {
  'file-tree': (b) => {
    if (!isArr(b.entries) || b.entries.length === 0) return ['entries must be a non-empty array'];
    return b.entries.flatMap((e, i) =>
      e && isStr(e.path) ? [] : [`entries[${i}].path is required`],
    );
  },
  diff: (b) => {
    const errors = [];
    if (typeof b.before !== 'string') errors.push('before must be a string');
    if (typeof b.after !== 'string') errors.push('after must be a string');
    if (b.mode !== undefined && b.mode !== 'split' && b.mode !== 'unified') {
      errors.push('mode must be "split" or "unified"');
    }
    return errors;
  },
  patch: (b) => (typeof b.patch === 'string' ? [] : ['patch must be a string']),
  code: (b) => (typeof b.code === 'string' ? [] : ['code must be a string']),
  'annotated-code': (b) => (typeof b.code === 'string' ? [] : ['code must be a string']),
  mermaid: (b) => (isStr(b.source) ? [] : ['source is required']),
  diagram: (b) => (isStr(b.html) ? [] : ['html is required']),
  'data-model': (b) => {
    if (!isArr(b.entities) || b.entities.length === 0) return ['entities must be a non-empty array'];
    return b.entities.flatMap((e, i) => {
      if (!e || !isStr(e.name)) return [`entities[${i}].name is required`];
      if (!isArr(e.fields) || e.fields.length === 0) return [`entities[${i}].fields must be non-empty`];
      return e.fields.flatMap((f, j) =>
        f && isStr(f.name) && isStr(f.type) ? [] : [`entities[${i}].fields[${j}] needs name and type`],
      );
    });
  },
  'api-endpoint': (b) => {
    const errors = [];
    if (!isStr(b.method)) errors.push('method is required');
    if (!isStr(b.path)) errors.push('path is required');
    return errors;
  },
  callout: (b) => (isStr(b.body) ? [] : ['body is required']),
  table: (b) => {
    const errors = [];
    if (!isArr(b.columns) || b.columns.length === 0) errors.push('columns must be a non-empty array');
    if (!isArr(b.rows)) errors.push('rows must be an array');
    return errors;
  },
  checklist: (b) => {
    if (!isArr(b.items) || b.items.length === 0) return ['items must be a non-empty array'];
    return b.items.flatMap((it, i) => (it && isStr(it.label) ? [] : [`items[${i}].label is required`]));
  },
  notes: (b) => (typeof b.markdown === 'string' ? [] : ['markdown must be a string']),
  image: (b) => (isStr(b.src) ? [] : ['src is required']),
  'image-pair': (b) => {
    const errors = [];
    if (!isStr(b.before)) errors.push('before is required');
    if (!isStr(b.after)) errors.push('after is required');
    return errors;
  },
};

function validateBlock(block, path, errors) {
  if (!block || typeof block !== 'object' || isArr(block)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!isStr(block.type)) {
    errors.push(`${path}.type is required`);
    return;
  }
  if (!BLOCK_TYPES.has(block.type)) {
    errors.push(`${path}.type "${block.type}" is unknown`);
    return;
  }
  if (block.id !== undefined && !isStr(block.id)) errors.push(`${path}.id must be a string`);

  if (CONTAINER_TYPES.has(block.type)) {
    validateContainer(block, path, errors);
    return;
  }
  const problems = BLOCK_CHECKS[block.type]?.(block) ?? [];
  for (const problem of problems) errors.push(`${path}.${problem}`);
}

function validateContainer(block, path, errors) {
  const list = block.type === 'columns' ? block.columns : block.tabs;
  const key = block.type === 'columns' ? 'columns' : 'tabs';
  if (!isArr(list) || list.length === 0) {
    errors.push(`${path}.${key} must be a non-empty array`);
    return;
  }
  list.forEach((child, i) => {
    if (!child || typeof child !== 'object' || !isArr(child.blocks)) {
      errors.push(`${path}.${key}[${i}].blocks must be an array`);
      return;
    }
    child.blocks.forEach((nested, j) =>
      validateBlock(nested, `${path}.${key}[${i}].blocks[${j}]`, errors),
    );
  });
}

// Pure validation: returns problems instead of throwing so callers (command,
// tests) decide how to surface them.
export function validateRecap(recap) {
  const errors = [];
  const warnings = [];
  if (!recap || typeof recap !== 'object' || isArr(recap)) {
    return { ok: false, errors: ['recap must be a JSON object'], warnings };
  }
  if (recap.version !== undefined && recap.version !== RECAP_SCHEMA_VERSION) {
    errors.push(`version must be ${RECAP_SCHEMA_VERSION} (got ${recap.version})`);
  }
  if (!isStr(recap.title)) errors.push('title is required');
  if (recap.brief !== undefined && typeof recap.brief !== 'string') {
    errors.push('brief must be a string');
  }
  if (!isArr(recap.blocks) || recap.blocks.length === 0) {
    errors.push('blocks must be a non-empty array');
    return { ok: false, errors, warnings };
  }
  recap.blocks.forEach((block, i) => validateBlock(block, `blocks[${i}]`, errors));
  return { ok: errors.length === 0, errors, warnings };
}
