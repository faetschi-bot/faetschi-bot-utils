import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

// Low-level HTML helpers shared by the block renderers. Kept free of block
// knowledge so renderers can import them without a cycle.

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

// class="language-<lang>" only when the language token is safe, so a bad value
// cannot break out of the attribute.
export function codeClass(language) {
  const clean = String(language ?? '').trim().toLowerCase();
  return /^[a-z0-9+#._-]+$/.test(clean) ? ` class="language-${clean}"` : '';
}

// Small Markdown subset for recap prose: headings, bullet/ordered lists,
// paragraphs, and inline code/bold/links. Rendered deterministically; anything
// richer belongs in a structured block.
function inlineMarkdown(escaped) {
  const codeSpans = [];
  let out = escaped.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const safe = /^(https?:|mailto:|#)/i.test(href) ? href : '#';
    return `<a href="${escapeAttr(safe)}">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
  return out;
}

export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (list !== 'ul') {
        closeList();
        list = 'ul';
        out.push('<ul>');
      }
      out.push(`<li>${inlineMarkdown(escapeHtml(bullet[1]))}</li>`);
      continue;
    }
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      if (list !== 'ol') {
        closeList();
        list = 'ol';
        out.push('<ol>');
      }
      out.push(`<li>${inlineMarkdown(escapeHtml(ordered[1]))}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineMarkdown(escapeHtml(line))}</p>`);
  }
  closeList();
  return out.join('\n');
}

// Local images are inlined as data URIs so the recap HTML stays self-contained
// and offline; remote URLs and data URIs are left as-is. The recap JSON is
// untrusted, so a local path is only read when it realpaths to a regular file
// inside the caller-provided asset root, has an allowlisted extension, and fits
// the size budget. Every rejection returns null and pushes a reason onto the
// warning list instead of breaking the report.
export function imageHref(src, ctx) {
  const value = String(src ?? '');
  if (/^(https?:|data:)/i.test(value)) return value;

  const warnings = ctx?.warnings ?? [];
  const reject = (reason) => {
    warnings.push(`image rejected (${value}): ${reason}`);
    return null;
  };

  if (!value) return reject('empty path');
  const assetRoot = ctx?.assetRoot;
  if (!assetRoot) return reject('no asset root configured');

  let root;
  try {
    root = realpathSync(assetRoot);
  } catch {
    return reject(`asset root not found: ${assetRoot}`);
  }

  // Resolve through realpath so symlinks cannot point outside the root, then
  // confirm containment before stat/read touch the target.
  let real;
  try {
    real = realpathSync(resolve(root, value));
  } catch {
    return reject('file not found');
  }
  if (real !== root && !real.startsWith(root + sep)) {
    return reject('path outside the asset root');
  }

  let stat;
  try {
    stat = statSync(real);
  } catch {
    return reject('cannot stat file');
  }
  if (!stat.isFile()) return reject('not a regular file');

  const ext = extname(real).toLowerCase();
  if (!Object.hasOwn(MIME_BY_EXT, ext)) {
    return reject(`unsupported image type: ${ext || '(none)'}`);
  }

  const maxBytes = ctx?.maxImageBytes;
  if (typeof maxBytes !== 'number' || !Number.isFinite(maxBytes) || maxBytes <= 0) {
    return reject('no image size limit configured');
  }
  if (stat.size > maxBytes) {
    return reject(`file too large (${stat.size} > ${maxBytes} bytes)`);
  }

  try {
    return `data:${MIME_BY_EXT[ext]};base64,${readFileSync(real).toString('base64')}`;
  } catch (e) {
    return reject(`cannot read file: ${e.message}`);
  }
}
