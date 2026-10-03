import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

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
// and offline; remote URLs are left as-is. A missing file yields null and a
// warning instead of a broken report.
export function imageHref(src, warnings) {
  const value = String(src ?? '');
  if (/^(https?:|data:)/i.test(value)) return value;
  const abs = resolve(value);
  if (!existsSync(abs)) {
    warnings.push(`image not found: ${value}`);
    return null;
  }
  const mime = MIME_BY_EXT[extname(abs).toLowerCase()] || 'image/png';
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
}
