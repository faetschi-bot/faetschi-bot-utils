import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CliError } from './errors.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_BYTES = 20 * 1024 * 1024;
const API_VERSION = '7.1';
const REQUEST_TIMEOUT_MS = 15_000;

export function readPng(imagePath, maxBytes = MAX_PNG_BYTES) {
  let info;
  try {
    info = lstatSync(imagePath);
  } catch {
    throw new CliError(`image not found: ${imagePath}`);
  }
  if (!info.isFile()) throw new CliError(`image is not a regular file: ${imagePath}`);
  if (info.size > maxBytes) throw new CliError(`PNG exceeds the ${maxBytes / (1024 * 1024)} MiB limit`);

  let bytes;
  try {
    bytes = readFileSync(imagePath);
  } catch {
    throw new CliError(`could not read image: ${imagePath}`);
  }
  if (bytes.length > maxBytes) throw new CliError(`PNG exceeds the ${maxBytes / (1024 * 1024)} MiB limit`);
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new CliError('image does not have a PNG signature');
  }

  return {
    fileName: basename(imagePath),
    bytes,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sha1: createHash('sha1').update(bytes).digest('hex'),
  };
}

export function validateOrganization(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CliError('--organization must be an Azure DevOps organization root URL');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) {
    throw new CliError('--organization must be an HTTPS Azure DevOps organization root URL');
  }

  let organization;
  let prefix;
  if (url.hostname === 'dev.azure.com') {
    const match = url.pathname.match(/^\/([^/]+)\/?$/);
    if (!match) throw new CliError('--organization must be a dev.azure.com organization root URL');
    organization = decodeOrganizationSegment(match[1]);
    prefix = `/${encodePathSegment(organization)}`;
  } else {
    const match = url.hostname.match(/^([a-z0-9-]+)\.visualstudio\.com$/i);
    if (!match || (url.pathname !== '/' && url.pathname !== '')) {
      throw new CliError('--organization must be an Azure DevOps organization root URL');
    }
    organization = match[1];
    prefix = '';
  }

  return { url: new URL(`${url.origin}${prefix}`), organization };
}

function decodeOrganizationSegment(segment) {
  let decoded;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new CliError('--organization contains an invalid organization name');
  }
  if (!decoded || decoded === '.' || decoded === '..' || /[\/\\\u0000-\u001f\u007f]/.test(decoded)) {
    throw new CliError('--organization contains an invalid organization name');
  }
  return decoded;
}

function encodePathSegment(value) {
  const segment = String(value);
  if (segment === '.' || segment === '..') throw new CliError('Azure DevOps path values cannot be dot segments');
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function requestUrl(root, project, repository, pullRequestId, suffix, query = {}) {
  const rootPath = root.pathname.replace(/\/$/, '');
  const url = new URL(
    `${rootPath}/${encodePathSegment(project)}/_apis/git/repositories/${encodePathSegment(repository)}`
      + `/pullRequests/${pullRequestId}/${suffix}`,
    root.origin,
  );
  for (const [key, value] of Object.entries({ ...query, 'api-version': API_VERSION })) {
    url.searchParams.set(key, value);
  }
  return url;
}

function expectedAttachmentPath(root, project, repository, pullRequestId, fileName) {
  return requestUrl(root, project, repository, pullRequestId, `attachments/${encodePathSegment(fileName)}`).pathname;
}

function parseJsonResponse(response) {
  return response.json().catch(() => {
    throw new Error('Azure DevOps returned invalid JSON');
  });
}

function validateToken(token) {
  if (typeof token !== 'string' || !token || token !== token.trim() || /[\r\n]/.test(token)) {
    throw new CliError('Azure DevOps access token is missing or invalid');
  }
  return token;
}

function validateContentHash(metadata, expectedHash, subject) {
  if (!metadata || typeof metadata !== 'object') throw new Error('Azure DevOps returned invalid attachment metadata');
  if (metadata.contentHash === undefined || metadata.contentHash === null || metadata.contentHash === '') return;
  if (typeof metadata.contentHash !== 'string' || metadata.contentHash.toLowerCase() !== expectedHash) {
    throw new Error(`Azure DevOps ${subject}`);
  }
}

async function request(fetchImpl, url, token, init = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...init.headers,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Azure DevOps request failed');
  }
  if (!response.ok) throw new Error(`Azure DevOps request failed (HTTP ${response.status})`);
  return response;
}

export function publishFileName(image) {
  return `visual-shot-${image.sha256}.png`;
}

export async function uploadPullRequestAttachment({
  organization,
  project,
  repository,
  pullRequestId,
  image,
  token,
  fetchImpl = fetch,
}) {
  validateToken(token);
  const root = validateOrganization(organization).url;
  const fileName = publishFileName(image);
  const expectedPath = expectedAttachmentPath(root, project, repository, pullRequestId, fileName);
  const attachmentUrl = requestUrl(root, project, repository, pullRequestId, `attachments/${encodePathSegment(fileName)}`);
  const listUrl = requestUrl(root, project, repository, pullRequestId, 'attachments');
  const listResponse = await request(fetchImpl, listUrl, token);
  const listPayload = await parseJsonResponse(listResponse);
  const attachments = Array.isArray(listPayload) ? listPayload : listPayload?.value;
  if (!Array.isArray(attachments)) throw new Error('Azure DevOps returned invalid attachment metadata');

  const existing = attachments.find((attachment) => {
    if (attachment?.displayName === fileName) return true;
    try {
      return new URL(attachment?.url).pathname === expectedPath;
    } catch {
      return false;
    }
  });

  if (existing) {
    validateContentHash(existing, image.sha1, 'attachment filename already exists with different content');
  } else {
    const response = await request(fetchImpl, attachmentUrl, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: image.bytes,
    });
    const metadata = await parseJsonResponse(response);
    validateContentHash(metadata, image.sha1, 'returned attachment metadata for different content');
  }

  // The API may return GUIDs instead of the supplied names. Use the known GET route.
  return { fileName, url: attachmentUrl.href, reused: Boolean(existing) };
}

function safeAltText(value) {
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export function attachmentMarkdown(url, alt) {
  return `![${safeAltText(alt)}](${url})`;
}

export function managedCommentContent(markdown, markerKey) {
  return `${markdown}\n\n<!-- visual-shot-ado:${encodeURIComponent(markerKey)} -->`;
}

export async function upsertManagedPullRequestComment({
  organization,
  project,
  repository,
  pullRequestId,
  markerKey,
  content,
  token,
  fetchImpl = fetch,
}) {
  validateToken(token);
  const root = validateOrganization(organization).url;
  const identityUrl = new URL(`${root.pathname.replace(/\/$/, '')}/_apis/connectionData`, root.origin);
  identityUrl.searchParams.set('api-version', '7.1-preview.1');
  const identityResponse = await request(fetchImpl, identityUrl, token);
  const identity = await parseJsonResponse(identityResponse);
  const publisherId = identity?.authorizedUser?.id;
  if (typeof publisherId !== 'string' || !publisherId) {
    throw new Error('Azure DevOps did not identify the comment publisher');
  }
  const threadsUrl = requestUrl(root, project, repository, pullRequestId, 'threads');
  const listResponse = await request(fetchImpl, threadsUrl, token);
  const listPayload = await parseJsonResponse(listResponse);
  const threads = Array.isArray(listPayload) ? listPayload : listPayload?.value;
  if (!Array.isArray(threads)) throw new Error('Azure DevOps returned invalid PR thread metadata');

  const marker = `<!-- visual-shot-ado:${encodeURIComponent(markerKey)} -->`;
  let managed;
  for (const thread of threads) {
    if (thread?.isDeleted || !Number.isInteger(thread.id) || thread.id <= 0) continue;
    const comment = thread.comments?.find((item) =>
      !item.isDeleted && (item.parentCommentId === 0 || item.parentCommentId === undefined)
        && typeof item.author?.id === 'string' && item.author.id.toLowerCase() === publisherId.toLowerCase()
        && typeof item.content === 'string' && item.content.endsWith(`\n\n${marker}`)
        && Number.isInteger(item.id) && item.id > 0,
    );
    if (comment) {
      managed = { threadId: thread.id, comment };
      break;
    }
  }

  if (managed?.comment.content === content) return 'unchanged';
  if (managed) {
    const updateUrl = requestUrl(
      root,
      project,
      repository,
      pullRequestId,
      `threads/${managed.threadId}/comments/${managed.comment.id}`,
    );
    await request(fetchImpl, updateUrl, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return 'updated';
  }

  await request(fetchImpl, threadsUrl, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comments: [{ parentCommentId: 0, content, commentType: 1 }],
      status: 4,
    }),
  });
  return 'created';
}
