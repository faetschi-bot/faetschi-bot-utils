import os from 'node:os';
import { join } from 'node:path';

export const DEFAULT_URL = 'http://127.0.0.1:5173/';
export const DEFAULT_OUT_DIR = 'tmp/images/PRs';
export const DEFAULT_VIEWPORT = '1280x720';
export const DEFAULT_SCALE = 2;
export const DEFAULT_WAIT = 1000;
export const DEFAULT_NAV_TIMEOUT = 30000;
export const DEFAULT_SERVER_TIMEOUT = 30000;
export const MAX_ERRORS = 50;
export const MAX_RETRIES = 10;
export const DEFAULT_PLAYWRIGHT_VERSION = '1.49.1';

// diff
export const DEFAULT_DIFF_THRESHOLD = 0.1;
export const DEFAULT_DIFF_SCALE = 2;

// terminal
export const DEFAULT_TERM_TIMEOUT = 120000;
export const DEFAULT_TERM_WIDTH = 900;
export const DEFAULT_TERM_FONT_SIZE = 13;
export const MAX_TERM_LINES = 2000;

// diagram
export const DEFAULT_DIAGRAM_FORMAT = 'png';
export const DEFAULT_MERMAID_VERSION = '11.4.1';
export const DEFAULT_DIAGRAM_SCALE = 2;

export function cacheDir(env = process.env) {
  return env.VISUAL_SHOT_CACHE
    || env.BRUTAL_VISUAL_CACHE
    || join(env.XDG_DATA_HOME || join(os.homedir(), '.local/share'), 'visual-shot');
}

export function playwrightVersion(env = process.env) {
  return env.VISUAL_SHOT_PLAYWRIGHT_VERSION
    || env.BRUTAL_PLAYWRIGHT_VERSION
    || DEFAULT_PLAYWRIGHT_VERSION;
}

export function mermaidVersion(env = process.env) {
  return env.VISUAL_SHOT_MERMAID_VERSION
    || env.BRUTAL_MERMAID_VERSION
    || DEFAULT_MERMAID_VERSION;
}
