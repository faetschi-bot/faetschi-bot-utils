// A Turn is the only record session-search indexes. Source adapters (OpenCode,
// Pi) normalize their native messages into this shape so the index, cache, and
// search layers never depend on either harness's schema.
export const TURN_SCHEMA_VERSION = 1;

export const TURN_ROLES = ['user', 'assistant', 'system', 'compaction', 'synthetic', 'shell'];
export const TURN_KINDS = ['text', 'reasoning', 'action', 'summary'];

export function makeTurn({
  harness,
  project = '',
  session,
  parent = null,
  seq,
  time = 0,
  role,
  kind,
  text,
  tool = null,
  input = null,
  refs = {},
}) {
  return { v: TURN_SCHEMA_VERSION, harness, project, session, parent, seq, time, role, kind, text, tool, input, refs };
}

// Returns a list of human-readable problems; empty means valid.
export function validateTurn(turn) {
  if (!turn || typeof turn !== 'object') return ['turn is not an object'];
  const errors = [];
  if (turn.v !== TURN_SCHEMA_VERSION) errors.push(`v must be ${TURN_SCHEMA_VERSION}`);
  if (typeof turn.harness !== 'string' || !turn.harness) errors.push('harness must be a non-empty string');
  if (typeof turn.project !== 'string') errors.push('project must be a string');
  if (typeof turn.session !== 'string' || !turn.session) errors.push('session must be a non-empty string');
  if (!TURN_ROLES.includes(turn.role)) errors.push(`role must be one of ${TURN_ROLES.join(', ')}`);
  if (!TURN_KINDS.includes(turn.kind)) errors.push(`kind must be one of ${TURN_KINDS.join(', ')}`);
  if (typeof turn.text !== 'string') errors.push('text must be a string');
  if (!Number.isInteger(turn.seq) || turn.seq < 0) errors.push('seq must be a non-negative integer');
  if (!Number.isFinite(turn.time)) errors.push('time must be finite');
  return errors;
}
