import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  attachmentMarkdown,
  managedCommentContent,
  publishFileName,
  readPng,
  uploadPullRequestAttachment,
  upsertManagedPullRequestComment,
} from '../lib/azure-devops.mjs';
import { parse as parseAdo, run as runAdo, validate as validateAdo } from '../lib/commands/ado.mjs';

const bin = fileURLToPath(new URL('../bin/visual-shot.mjs', import.meta.url));
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const token = 'test-token-never-print';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'visual-shot-ado-'));
}

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

function imageFile(directory, name = 'review.png', body = Buffer.from('mock png bytes')) {
  const path = join(directory, name);
  writeFileSync(path, Buffer.concat([signature, body]));
  return path;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function baseOptions(image) {
  return {
    organization: 'https://dev.azure.com/example-org',
    project: 'A Project',
    repository: 'repo/name',
    pullRequestId: 42,
    image,
    token,
  };
}

function endpointFor(image) {
  return `https://dev.azure.com/example-org/A%20Project/_apis/git/repositories/repo%2Fname/pullRequests/42/attachments/${publishFileName(image)}`;
}

test('ado prepare writes exact MCP upload arguments and emits metadata only', () => {
  const directory = tempDir();
  try {
    const image = imageFile(directory);
    const out = join(directory, 'payload.json');
    const result = run(['ado', 'prepare', image, '--project', 'web project', '--out', out, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(Object.keys(payload), ['project', 'fileName', 'content']);
    assert.deepEqual(payload, {
      project: 'web project',
      fileName: 'review.png',
      content: readFileSync(image).toString('base64'),
    });
    assert.equal(result.stdout.includes(payload.content), false);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: true,
      out,
      project: 'web project',
      fileName: 'review.png',
      sizeBytes: readFileSync(image).length,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('ado prepare rejects directories, bad signatures, and PNGs over 4 MiB', () => {
  const directory = tempDir();
  try {
    const badHeader = join(directory, 'bad.png');
    const tooLarge = join(directory, 'large.png');
    writeFileSync(badHeader, Buffer.from('not a png'));
    writeFileSync(tooLarge, Buffer.concat([signature, Buffer.alloc(4 * 1024 * 1024)]));
    for (const [image, message] of [
      [directory, /regular file/],
      [badHeader, /PNG signature/],
      [tooLarge, /4 MiB limit/],
    ]) {
      const result = run(['ado', 'prepare', image, '--project', 'web', '--out', join(directory, 'payload.json'), '--json']);
      assert.equal(result.status, 2);
      assert.match(JSON.parse(result.stdout).error, message);
    }
    assert.equal(existsSync(join(directory, 'payload.json')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('ado prepare preserves the input when the output is a hard link to it', () => {
  const directory = tempDir();
  try {
    const input = imageFile(directory);
    const original = readFileSync(input);
    const output = join(directory, 'payload.json');
    linkSync(input, output);
    const result = run(['ado', 'prepare', input, '--project', 'web', '--out', output, '--json']);
    assert.equal(result.status, 2);
    assert.match(JSON.parse(result.stdout).error, /image input/);
    assert.deepEqual(readFileSync(input), original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('readPng accepts a regular signed PNG and enforces the file size before upload', () => {
  const directory = tempDir();
  try {
    const path = imageFile(directory);
    const image = readPng(path);
    assert.equal(image.fileName, 'review.png');
    assert.equal(image.bytes.subarray(0, 8).equals(signature), true);
    assert.equal(image.sizeBytes, lstatSync(path).size);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('publish uploads exact bytes with bearer auth and safely encodes endpoint segments', async () => {
  const directory = tempDir();
  try {
    const image = readPng(imageFile(directory));
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      if (options.method === 'POST') {
        return jsonResponse({
          url: `https://dev.azure.com/example-org/project-guid/_apis/git/repositories/repository-guid/pullRequests/42/attachments/${publishFileName(image)}?api-version=7.1`,
          contentHash: image.sha1,
        }, 201);
      }
      return jsonResponse({ count: 0, value: [] });
    };
    const attachment = await uploadPullRequestAttachment({ ...baseOptions(image), fetchImpl });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.method, undefined);
    assert.match(calls[0].url, /A%20Project\/.*repositories\/repo%2Fname\/pullRequests\/42\/attachments\?/);
    assert.equal(calls[1].url, `${endpointFor(image)}?api-version=7.1`);
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(calls[1].options.body.equals(image.bytes), true);
    assert.equal(calls[1].options.headers.Authorization, `Bearer ${token}`);
    assert.equal(calls[1].options.headers['Content-Type'], 'application/octet-stream');
    assert.equal(calls[1].options.redirect, 'manual');
    assert.ok(calls[1].options.signal);
    assert.deepEqual(attachment, { fileName: publishFileName(image), url: `${endpointFor(image)}?api-version=7.1`, reused: false });
    assert.equal(attachmentMarkdown(attachment.url, 'review [image]'), `![review \\[image\\]](${endpointFor(image)}?api-version=7.1)`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native publishing accepts PNGs above the MCP payload limit and rejects files above 20 MiB', async () => {
  const directory = tempDir();
  try {
    const image = readPng(imageFile(directory, 'large.png', Buffer.alloc(5 * 1024 * 1024)));
    let uploadedBytes = 0;
    await uploadPullRequestAttachment({
      ...baseOptions(image),
      fetchImpl: async (url, options) => {
        if (options.method !== 'POST') return jsonResponse([]);
        uploadedBytes = options.body.length;
        return jsonResponse({ contentHash: image.sha1 }, 201);
      },
    });
    assert.equal(uploadedBytes, image.sizeBytes);
    assert.ok(uploadedBytes > 4 * 1024 * 1024);
    const tooLarge = imageFile(directory, 'too-large.png', Buffer.alloc(20 * 1024 * 1024));
    assert.throws(() => readPng(tooLarge), /20 MiB limit/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('publish accepts an official visualstudio.com organization root and rejects a missing token before fetch', async () => {
  const directory = tempDir();
  try {
    const image = readPng(imageFile(directory));
    let calls = 0;
    const options = {
      ...baseOptions(image),
      organization: 'https://example.visualstudio.com/',
      fetchImpl: async (url, requestOptions) => {
        calls++;
        if (requestOptions.method === 'POST') {
          const attachmentUrl = new URL(url);
          attachmentUrl.search = '';
          return jsonResponse({ url: attachmentUrl.href }, 201);
        }
        return jsonResponse([]);
      },
    };
    const result = await uploadPullRequestAttachment(options);
    assert.equal(new URL(result.url).hostname, 'example.visualstudio.com');
    assert.equal(calls, 2);

    calls = 0;
    await assert.rejects(
      uploadPullRequestAttachment({ ...options, token: '' }),
      /access token is missing or invalid/,
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('publish reuses content-hashed attachment metadata after an interrupted retry', async () => {
  const directory = tempDir();
  try {
    const image = readPng(imageFile(directory));
    let saved = false;
    let posts = 0;
    const fetchImpl = async (url, options) => {
      if (options.method === 'POST') {
        posts++;
        saved = true;
        throw new Error(`network reset with ${token}`);
      }
      return jsonResponse({
        value: saved ? [{
          displayName: publishFileName(image),
          url: endpointFor(image),
          contentHash: image.sha1,
        }] : [],
      });
    };
    await assert.rejects(
      uploadPullRequestAttachment({ ...baseOptions(image), fetchImpl }),
      (error) => !error.message.includes(token) && error.message === 'Azure DevOps request failed',
    );
    const retry = await uploadPullRequestAttachment({ ...baseOptions(image), fetchImpl });
    assert.equal(retry.reused, true);
    assert.equal(retry.url, `${endpointFor(image)}?api-version=7.1`);
    assert.equal(posts, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('publish rejects untrusted organization roots and API errors without leaking secrets', async () => {
  const directory = tempDir();
  try {
    const image = readPng(imageFile(directory));
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return jsonResponse({ message: token }, 403);
    };
    await assert.rejects(
      uploadPullRequestAttachment({
        ...baseOptions(image),
        organization: 'https://attacker.example/org',
        fetchImpl,
      }),
      /Azure DevOps organization root URL/,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      uploadPullRequestAttachment({ ...baseOptions(image), fetchImpl }),
      (error) => error.message === 'Azure DevOps request failed (HTTP 403)' && !error.message.includes(token),
    );

    calls = 0;
    for (const pathInput of [{ project: '..' }, { repository: '.' }]) {
      await assert.rejects(
        uploadPullRequestAttachment({ ...baseOptions(image), ...pathInput, fetchImpl }),
        /dot segments/,
      );
    }
    assert.equal(calls, 0);

    const untrustedResponseFetch = async (url, options) => {
      if (options.method !== 'POST') return jsonResponse([]);
      return jsonResponse({ url: 'https://attacker.example/steal', contentHash: image.sha1 }, 201);
    };
    const result = await uploadPullRequestAttachment({ ...baseOptions(image), fetchImpl: untrustedResponseFetch });
    assert.equal(result.url, `${endpointFor(image)}?api-version=7.1`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('managed comments update only a matching root comment and preserve replies and unrelated threads', async () => {
  const markerKey = 'review.png';
  const marker = `<!-- visual-shot-ado:${encodeURIComponent(markerKey)} -->`;
  const currentContent = `![old](https://dev.azure.com/example-org/P/_apis/git/repositories/r/pullRequests/42/attachments/visual-shot-old-hash.png)\n\n${marker}`;
  const nextContent = `![new](https://dev.azure.com/example-org/P/_apis/git/repositories/r/pullRequests/42/attachments/visual-shot-new-hash.png)\n\n${marker}`;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (new URL(url).pathname.endsWith('/connectionData')) return jsonResponse({ authorizedUser: { id: 'publisher' } });
    if (options.method === 'PATCH') return jsonResponse({ content: nextContent });
    return jsonResponse({ value: [
      { id: 12, comments: [{ id: 1, parentCommentId: 0, content: 'unrelated comment' }] },
      { id: 13, comments: [{ id: 1, parentCommentId: 0, content: currentContent, author: { id: 'another-user' } }] },
      { id: 44, comments: [
        { id: 3, parentCommentId: 0, content: currentContent, author: { id: 'publisher' } },
        { id: 4, parentCommentId: 3, content: 'human reply' },
      ] },
    ] });
  };
  const result = await upsertManagedPullRequestComment({
    organization: 'https://dev.azure.com/example-org',
    project: 'P', repository: 'r', pullRequestId: 42, markerKey, content: nextContent, token, fetchImpl,
  });
  assert.equal(result, 'updated');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].options.method, 'PATCH');
  assert.match(calls[2].url, /threads\/44\/comments\/3\?/);
  assert.deepEqual(JSON.parse(calls[2].options.body), { content: nextContent });
  assert.equal(calls[2].options.headers.Authorization, `Bearer ${token}`);
});

test('managed comments create a new thread without editing unrelated comments', async () => {
  const markerKey = 'review.png';
  const markdown = attachmentMarkdown('https://dev.azure.com/example-org/P/_apis/git/repositories/r/pullRequests/42/attachments/file.png', 'preview');
  const content = managedCommentContent(markdown, markerKey);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (new URL(url).pathname.endsWith('/connectionData')) return jsonResponse({ authorizedUser: { id: 'publisher' } });
    return options.method === 'POST' ? jsonResponse({ id: 45 }) : jsonResponse({ value: [
      { id: 12, comments: [{ id: 1, parentCommentId: 0, content: 'human comment' }] },
    ] });
  };
  const result = await upsertManagedPullRequestComment({
    organization: 'https://dev.azure.com/example-org',
    project: 'P', repository: 'r', pullRequestId: 42, markerKey, content, token, fetchImpl,
  });
  assert.equal(result, 'created');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    comments: [{ parentCommentId: 0, content, commentType: 1 }],
    status: 4,
  });
});

test('comment failure returns the uploaded artifact and retry reuses its attachment', async () => {
  const directory = tempDir();
  const previousToken = process.env.SYSTEM_ACCESSTOKEN;
  process.env.SYSTEM_ACCESSTOKEN = token;
  try {
    const imagePath = imageFile(directory);
    const image = readPng(imagePath);
    const plan = validateAdo(parseAdo([
      'publish', imagePath,
      '--organization', 'https://dev.azure.com/example-org',
      '--project', 'A Project',
      '--repository', 'repo/name',
      '--pr', '42',
      '--comment', '--json',
    ]));
    let attachmentMetadata;
    let threadReads = 0;
    let attachmentPosts = 0;
    const fetchImpl = async (url, options) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname.endsWith('/connectionData')) return jsonResponse({ authorizedUser: { id: 'publisher' } });
      if (requestUrl.pathname.endsWith('/attachments') && !options.method) {
        return jsonResponse({ value: attachmentMetadata ? [attachmentMetadata] : [] });
      }
      if (requestUrl.pathname.includes('/attachments/') && options.method === 'POST') {
        attachmentPosts++;
        const attachmentUrl = new URL(url);
        attachmentUrl.search = '';
        attachmentMetadata = { displayName: publishFileName(image), url: attachmentUrl.href, contentHash: image.sha1 };
        return jsonResponse(attachmentMetadata, 201);
      }
      if (requestUrl.pathname.endsWith('/threads') && !options.method) {
        threadReads++;
        return threadReads === 1 ? jsonResponse({ message: token }, 403) : jsonResponse({ value: [] });
      }
      if (requestUrl.pathname.endsWith('/threads') && options.method === 'POST') return jsonResponse({ id: 9 });
      throw new Error(`unexpected request ${options.method} ${requestUrl.pathname}`);
    };
    const output = [];
    const originalLog = console.log;
    console.log = (message) => output.push(message);
    try {
      assert.equal(await runAdo(plan, { fetchImpl }), 1);
      assert.equal(await runAdo(plan, { fetchImpl }), 0);
    } finally {
      console.log = originalLog;
    }
    const failedComment = JSON.parse(output[0]);
    const retry = JSON.parse(output[1]);
    assert.equal(failedComment.ok, false);
    assert.equal(failedComment.attachmentUrl, `${endpointFor(image)}?api-version=7.1`);
    assert.ok(failedComment.markdown.includes(endpointFor(image)));
    assert.equal(JSON.stringify(failedComment).includes(token), false);
    assert.equal(retry.ok, true);
    assert.equal(retry.reused, true);
    assert.equal(retry.comment, 'created');
    assert.equal(attachmentPosts, 1);
  } finally {
    if (previousToken === undefined) delete process.env.SYSTEM_ACCESSTOKEN;
    else process.env.SYSTEM_ACCESSTOKEN = previousToken;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('publish filenames are deterministic content hashes', () => {
  const bytes = Buffer.concat([signature, Buffer.from('same image')]);
  const image = { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.equal(publishFileName(image), `visual-shot-${image.sha256}.png`);
  assert.equal(publishFileName(image), publishFileName({ ...image }));
});
