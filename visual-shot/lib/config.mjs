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
export const DEFAULT_DIFF_SCALE = 1;

// terminal
export const DEFAULT_TERM_TIMEOUT = 120000;
export const DEFAULT_TERM_WIDTH = 900;
export const DEFAULT_TERM_FONT_SIZE = 13;
export const MAX_TERM_LINES = 2000;
export const MAX_TERM_BYTES = 8 * 1024 * 1024;

// diagram
export const DEFAULT_DIAGRAM_FORMAT = 'png';
export const DEFAULT_MERMAID_VERSION = '11.4.1';
export const DEFAULT_DIAGRAM_SCALE = 2;

// recap
// A recap is usually posted into a PR, where GitHub renders it on a dark
// surface; dark is the default and `--theme light` opts back into light.
export const DEFAULT_RECAP_THEME = 'dark';
export const DEFAULT_RECAP_WIDTH = 1100;
export const DEFAULT_RECAP_SCALE = 2;
export const MAX_RECAP_PATCH_FILES = 25;
export const MAX_RECAP_PATCH_BYTES = 400000;
export const DEFAULT_HIGHLIGHT_VERSION = '11.10.0';

// Recap input/render limits. Untrusted recap JSON and asset paths must not be
// able to exhaust memory, read arbitrary files, or produce unbounded output.
export const MAX_RECAP_BLOCKS = 500;
export const MAX_RECAP_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_RECAP_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_RECAP_ANNOTATION_LINES = 5000;
export const MIN_RECAP_WIDTH = 320;
export const MAX_RECAP_WIDTH = 4000;
export const MAX_RECAP_SCALE = 4;
export const MAX_RECAP_PNG_HEIGHT = 20000;

// SHA-256 of the default pinned assets (immutable per npm version). A mismatch
// means a tampered or corrupted download, so verification fails closed. When a
// version is overridden via env there is no pinned hash; callers skip the check.
export const ASSET_SHA256 = {
  'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js':
    'a43bc1afd446f9c4cc66ac5dd45d02e8d65e26fc5344ec0ef787f88d6ddb6f9e',
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/highlight.min.js':
    '471ef9ae90c407af440fcdc48edfeeb562106b3267bd12d99071c162fb52ed32',
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/styles/github.min.css':
    '3a9a5def8b9c311e5ae43abde85c63133185eed4f0d9f67fea4b00a8308cf066',
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/styles/github-dark.min.css':
    '9f208d022102b1d0c7aebfecd8e42ca7997d5de636649d2b31ea63093d809019',
};

export function assetSha256(url) {
  return ASSET_SHA256[url] || null;
}

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

export function highlightVersion(env = process.env) {
  return env.VISUAL_SHOT_HIGHLIGHT_VERSION || DEFAULT_HIGHLIGHT_VERSION;
}
