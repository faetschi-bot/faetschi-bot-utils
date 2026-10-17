#!/usr/bin/env node
// Check the artifact evidence in a pull request body.
//
//   node check-pr-artifact.mjs <body-file|-> [--json]
//   gh pr view 123 --json body -q .body | node check-pr-artifact.mjs -
//
// The body must contain a non-empty `## Artifact` section holding at least one
// evidence element: an image, a Mermaid fence, another fenced code block, a
// Markdown table, or a link. HTML comments do not count as content.
//
// Exit codes: 0 contract holds, 1 contract violated, 2 usage error.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: check-pr-artifact.mjs <body-file|-> [--json]';

// The section runs from the `## Artifact` heading to the next `##`/`#` heading.
export function artifactSection(body) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Artifact\s*$/i.test(line));
  if (start === -1) return null;
  let end = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

export function findEvidence(section) {
  const text = stripComments(section);
  const kinds = new Set();
  if (/!\[[^\]]*\]\([^)]+\)/.test(text) || /<img\b[^>]*>/i.test(text)) kinds.add('image');
  if (/```mermaid\b/i.test(text)) kinds.add('mermaid');
  if (/^\s*\|.+\|\s*$/m.test(text)) kinds.add('table');
  if (/https?:\/\/\S+/i.test(text)) kinds.add('link');
  for (const match of text.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)) {
    if (match[1].trim()) {
      kinds.add('code-block');
      break;
    }
  }
  return [...kinds];
}

export function checkBody(body) {
  const section = artifactSection(body);
  if (section === null) return { ok: false, reason: 'missing "## Artifact" section' };
  if (!stripComments(section).trim()) return { ok: false, reason: '"## Artifact" section is empty' };
  const evidence = findEvidence(section);
  if (evidence.length === 0) {
    return {
      ok: false,
      reason: '"## Artifact" has no evidence (image, mermaid, code block, table, or link)',
    };
  }
  return { ok: true, evidence };
}

function main(argv) {
  const inputs = [];
  let json = false;
  for (const arg of argv) {
    if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      return 0;
    } else if (arg.startsWith('-') && arg !== '-') {
      console.error(`unknown option: ${arg}\n${USAGE}`);
      return 2;
    } else if (inputs.length === 0) {
      inputs.push(arg);
    } else {
      console.error(`unexpected argument: ${arg}\n${USAGE}`);
      return 2;
    }
  }
  if (inputs.length === 0) {
    console.error(USAGE);
    return 2;
  }

  const input = inputs[0];
  let body;
  try {
    body = input === '-' ? readFileSync(0, 'utf8') : readFileSync(input, 'utf8');
  } catch (error) {
    console.error(`cannot read ${input}: ${error.message}\n${USAGE}`);
    return 2;
  }

  const result = checkBody(body);
  if (json) console.log(JSON.stringify({ ...result, input }));
  else if (result.ok) console.log(`OK: artifact evidence found (${result.evidence.join(', ')})`);
  else console.error(`FAIL: ${result.reason}`);
  return result.ok ? 0 : 1;
}

// Run only when invoked as a CLI, so tests can import the functions.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
