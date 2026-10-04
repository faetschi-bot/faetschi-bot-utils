// Contract between the recap author (an agent following the visual-recap skill)
// and the deterministic renderer. Kept intentionally small and strict: the
// renderer must build the report mechanically from this JSON, never infer.

import { MAX_RECAP_ANNOTATION_LINES, MAX_RECAP_BLOCKS } from '../config.mjs';
import { parseLineRange } from './diff.mjs';

export const RECAP_SCHEMA_VERSION = 1;

export const CHANGE_VALUES = new Set(['added', 'removed', 'modified', 'renamed']);
export const TONE_VALUES = new Set(['info', 'decision', 'risk', 'warning', 'success']);
export const WIREFRAME_SURFACES = new Set(['desktop', 'tablet', 'mobile', 'browser', 'popover', 'panel']);

// Per-surface body height (px) used when the author omits `height`. The cap
// keeps a hostile/typo'd number from turning one mockup into a giant iframe.
export const WIREFRAME_DEFAULT_HEIGHTS = {
  browser: 560,
  desktop: 560,
  tablet: 720,
  mobile: 640,
  popover: 320,
  panel: 360,
};
export const MAX_WIREFRAME_HEIGHT = 2000;

// `json.collapsedDepth` bounds how deep a tree starts expanded. The cap keeps an
// untrusted number from forcing a giant stylesheet-free recursion; omitting the
// field expands everything (the renderer treats the default as unbounded).
export const MAX_JSON_COLLAPSED_DEPTH = 50;

export const BLOCK_TYPES = new Set([
  'file-tree',
  'diff',
  'patch',
  'image',
  'image-pair',
  'mermaid',
  'diagram',
  'wireframe',
  'data-model',
  'api-endpoint',
  'callout',
  'table',
  'checklist',
  'notes',
  'code',
  'annotated-code',
  'json',
  'columns',
  'tabs',
]);

const CONTAINER_TYPES = new Set(['columns', 'tabs']);

// Bounds recursion through nested columns/tabs. Without this, a deeply nested
// (untrusted) recap overflows the call stack and throws a RangeError instead of
// surfacing a normal validation error.
const MAX_RECAP_NESTING = 12;

function isStr(value) {
  return typeof value === 'string' && value.length > 0;
}

function isArr(value) {
  return Array.isArray(value);
}

const CHANGE_ERROR = 'change must be one of added, removed, modified, renamed';

// Annotations are line-range references into a diff/code block. Reject a
// non-array, a missing/oversized `lines` spec (the parser caps expansion), and
// an out-of-enum `side`; messages stay relative so validateBlock can prefix the
// block path.
function annotationProblems(block) {
  if (block.annotations === undefined) return [];
  if (!isArr(block.annotations)) return ['annotations must be an array'];
  const problems = [];
  block.annotations.forEach((a, i) => {
    const at = `annotations[${i}]`;
    if (!a || typeof a !== 'object' || isArr(a)) {
      problems.push(`${at} must be an object`);
      return;
    }
    if (typeof a.lines !== 'string' || a.lines.length === 0) {
      problems.push(`${at}.lines is required`);
      return;
    }
    if (parseLineRange(a.lines).length === 0) {
      problems.push(`${at}.lines "${a.lines}" is not a valid line range or exceeds ${MAX_RECAP_ANNOTATION_LINES} lines`);
    }
    if (a.side !== undefined && a.side !== 'before' && a.side !== 'after') {
      problems.push(`${at}.side must be "before" or "after"`);
    }
  });
  return problems;
}

// Shared validation for api-endpoint `params` / `responses`: each entry may
// carry a diff-aware `change` (same enum as elsewhere) and a `was` label for the
// previous name/status. Absent fields are fine; a present one must be well-typed.
function endpointEntryProblems(list, key, errors) {
  if (list === undefined) return;
  if (!isArr(list)) {
    errors.push(`${key} must be an array`);
    return;
  }
  list.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || isArr(entry)) {
      errors.push(`${key}[${i}] must be an object`);
      return;
    }
    if (entry.name !== undefined && typeof entry.name !== 'string') {
      errors.push(`${key}[${i}].name must be a string`);
    }
    if (entry.change !== undefined && !CHANGE_VALUES.has(entry.change)) {
      errors.push(`${key}[${i}].${CHANGE_ERROR}`);
    }
    if (entry.was !== undefined && typeof entry.was !== 'string') {
      errors.push(`${key}[${i}].was must be a string`);
    }
  });
}

// Each entry returns a list of human-readable problems for one block, given the
// block's path (e.g. `blocks[2]`) for locatable error messages.
const BLOCK_CHECKS = {
  'file-tree': (b) => {
    if (!isArr(b.entries) || b.entries.length === 0) return ['entries must be a non-empty array'];
    return b.entries.flatMap((e, i) => {
      if (!e || !isStr(e.path)) return [`entries[${i}].path is required`];
      if (e.change !== undefined && !CHANGE_VALUES.has(e.change)) {
        return [`entries[${i}].${CHANGE_ERROR}`];
      }
      return [];
    });
  },
  diff: (b) => {
    const errors = [];
    if (typeof b.before !== 'string') errors.push('before must be a string');
    if (typeof b.after !== 'string') errors.push('after must be a string');
    if (b.mode !== undefined && b.mode !== 'split' && b.mode !== 'unified') {
      errors.push('mode must be "split" or "unified"');
    }
    return errors.concat(annotationProblems(b));
  },
  patch: (b) => (typeof b.patch === 'string' ? [] : ['patch must be a string']),
  code: (b) => (typeof b.code === 'string' ? [] : ['code must be a string']),
  'annotated-code': (b) => {
    const errors = typeof b.code === 'string' ? [] : ['code must be a string'];
    return errors.concat(annotationProblems(b));
  },
  json: (b) => {
    // `data` may legitimately be null/false/0/"", so presence is checked with
    // `in`, never truthiness.
    const errors = 'data' in b ? [] : ['data is required'];
    if (b.title !== undefined && typeof b.title !== 'string') errors.push('title must be a string');
    if (b.collapsedDepth !== undefined) {
      if (!Number.isInteger(b.collapsedDepth) || b.collapsedDepth < 0) {
        errors.push('collapsedDepth must be a non-negative integer');
      } else if (b.collapsedDepth > MAX_JSON_COLLAPSED_DEPTH) {
        errors.push(`collapsedDepth must be at most ${MAX_JSON_COLLAPSED_DEPTH}`);
      }
    }
    return errors;
  },
  mermaid: (b) => (isStr(b.source) ? [] : ['source is required']),
  diagram: (b) => (isStr(b.html) ? [] : ['html is required']),
  wireframe: (b) => {
    const errors = isStr(b.html) ? [] : ['html is required'];
    if (b.surface !== undefined && !WIREFRAME_SURFACES.has(b.surface)) {
      errors.push('surface must be one of desktop, tablet, mobile, browser, popover, panel');
    }
    if (b.css !== undefined && typeof b.css !== 'string') errors.push('css must be a string');
    if (b.caption !== undefined && typeof b.caption !== 'string') errors.push('caption must be a string');
    if (b.height !== undefined) {
      if (!Number.isInteger(b.height) || b.height <= 0) {
        errors.push('height must be a positive integer');
      } else if (b.height > MAX_WIREFRAME_HEIGHT) {
        errors.push(`height must be at most ${MAX_WIREFRAME_HEIGHT}`);
      }
    }
    return errors;
  },
  'data-model': (b) => {
    if (!isArr(b.entities) || b.entities.length === 0) return ['entities must be a non-empty array'];
    return b.entities.flatMap((e, i) => {
      if (!e || !isStr(e.name)) return [`entities[${i}].name is required`];
      const errors = [];
      if (e.change !== undefined && !CHANGE_VALUES.has(e.change)) {
        errors.push(`entities[${i}].${CHANGE_ERROR}`);
      }
      if (!isArr(e.fields) || e.fields.length === 0) {
        errors.push(`entities[${i}].fields must be non-empty`);
        return errors;
      }
      e.fields.forEach((f, j) => {
        if (!f || !isStr(f.name) || !isStr(f.type)) {
          errors.push(`entities[${i}].fields[${j}] needs name and type`);
        } else if (f.change !== undefined && !CHANGE_VALUES.has(f.change)) {
          errors.push(`entities[${i}].fields[${j}].${CHANGE_ERROR}`);
        }
      });
      return errors;
    });
  },
  'api-endpoint': (b) => {
    const errors = [];
    if (!isStr(b.method)) errors.push('method is required');
    if (!isStr(b.path)) errors.push('path is required');
    if (b.change !== undefined && !CHANGE_VALUES.has(b.change)) errors.push(CHANGE_ERROR);
    endpointEntryProblems(b.params, 'params', errors);
    endpointEntryProblems(b.responses, 'responses', errors);
    return errors;
  },
  callout: (b) => {
    const errors = isStr(b.body) ? [] : ['body is required'];
    if (b.tone !== undefined && !TONE_VALUES.has(b.tone)) {
      errors.push('tone must be one of info, decision, risk, warning, success');
    }
    return errors;
  },
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

function validateBlock(block, path, errors, depth = 0) {
  if (depth > MAX_RECAP_NESTING) {
    errors.push(`${path} exceeds maximum nesting depth (${MAX_RECAP_NESTING})`);
    return;
  }
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
    validateContainer(block, path, errors, depth);
    return;
  }
  const problems = BLOCK_CHECKS[block.type]?.(block) ?? [];
  for (const problem of problems) errors.push(`${path}.${problem}`);
}

function validateContainer(block, path, errors, depth) {
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
      validateBlock(nested, `${path}.${key}[${i}].blocks[${j}]`, errors, depth + 1),
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
  if (recap.blocks.length > MAX_RECAP_BLOCKS) {
    errors.push(`blocks must have at most ${MAX_RECAP_BLOCKS} entries (got ${recap.blocks.length})`);
    return { ok: false, errors, warnings };
  }
  recap.blocks.forEach((block, i) => validateBlock(block, `blocks[${i}]`, errors));
  return { ok: errors.length === 0, errors, warnings };
}
