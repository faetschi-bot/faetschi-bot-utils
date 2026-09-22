import os from 'node:os';
import { join } from 'node:path';

export const DEFAULT_URL = 'http://127.0.0.1:5173/';
export const DEFAULT_OUT_DIR = 'tmp/images/PRs';
export const DEFAULT_VIEWPORT = '1280x720';
export const DEFAULT_SCALE = 2;
export const DEFAULT_WAIT = 1000;
export const DEFAULT_PLAYWRIGHT_VERSION = '1.49.1';

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
