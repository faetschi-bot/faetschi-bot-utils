// MCP server exposing the cached history. The SDK is imported lazily by the CLI
// so index/search/doctor keep working on a checkout without dependencies.
//
// OpenCode passes the invoking session id in `_meta`; when present it scopes a
// search to that session's project even if the server's cwd differs. Pi does not
// send it, so scope falls back to the server cwd.
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { listIndexDirs, readIndexDocs, readIndexMeta, resolveCacheRoot } from './core/cache.mjs';
import { buildIndex, searchSessions } from './core/retrieval.mjs';
import { PACKAGE_VERSION } from './package-info.mjs';

export const OPENCODE_SESSION_META_KEY = 'ai.opencode/sessionID';
const MAX_LIMIT = 50;

export function readOpencodeSessionId(ctx) {
  const value = ctx?.mcpReq?._meta?.[OPENCODE_SESSION_META_KEY];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function createMcpServer({ cacheRoot = resolveCacheRoot(), cwd = process.cwd() } = {}) {
  const server = new McpServer(
    { name: 'session-search', version: PACKAGE_VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'history_search',
    {
      title: 'Search session history',
      description:
        'Search local AI coding-agent session history (OpenCode, Pi). Use it for "where did we solve X before". Returns session-level hits with a snippet.',
      inputSchema: z.object({
        query: z.string().min(1),
        scope: z.enum(['project', 'all']).optional(),
        limit: z.number().int().positive().max(MAX_LIMIT).optional(),
        includeSubagents: z.boolean().optional(),
      }),
      outputSchema: z.object({
        query: z.string(),
        scope: z.string(),
        count: z.number(),
        hits: z.array(
          z.object({
            harness: z.string(),
            session: z.string(),
            title: z.string(),
            project: z.string(),
            parent: z.string().nullable(),
            score: z.number(),
            matched: z.number(),
            snippet: z.string(),
          }),
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, scope, limit = 10, includeSubagents = false }, ctx) => {
      const sessionID = readOpencodeSessionId(ctx);
      const resolvedScope = scope ?? 'project';
      const { turns, sources, project } = loadTurns({ cacheRoot, cwd, sessionID, scope: resolvedScope });
      if (sources.length === 0) {
        return {
          content: [{ type: 'text', text: `No index found${project ? ` for ${project}` : ''}. Run \`session-search index\` first.` }],
          isError: true,
        };
      }
      const hits = searchSessions(buildIndex(turns), query, { limit, includeSubagents });
      return {
        content: [{ type: 'text', text: renderHits(query, hits) }],
        structuredContent: { query, scope: resolvedScope, count: hits.length, hits },
      };
    },
  );

  server.registerTool(
    'history_show',
    {
      title: 'Show a session',
      description: 'Print the indexed turns of one session, in order.',
      inputSchema: z.object({
        session: z.string().min(1),
        limit: z.number().int().positive().max(MAX_LIMIT).optional(),
      }),
      outputSchema: z.object({
        session: z.string(),
        count: z.number(),
        turns: z.array(
          z.object({ role: z.string(), kind: z.string(), time: z.number(), text: z.string() }),
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ session, limit = 20 }) => {
      const turns = listIndexDirs(cacheRoot)
        .flatMap((dir) => readIndexDocs(dir))
        .filter((turn) => turn.session === session)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit)
        .map((turn) => ({ role: turn.role, kind: turn.kind, time: turn.time, text: turn.text }));
      if (turns.length === 0) {
        return { content: [{ type: 'text', text: `Session not found in the index: ${session}` }], isError: true };
      }
      return {
        content: [{ type: 'text', text: turns.map((turn) => `${turn.role}/${turn.kind}: ${turn.text}`).join('\n') }],
        structuredContent: { session, count: turns.length, turns },
      };
    },
  );

  return server;
}

export function serve({ cacheRoot, cwd } = {}) {
  serveStdio(() => createMcpServer({ cacheRoot, cwd }));
}

function loadTurns({ cacheRoot, cwd, sessionID, scope }) {
  const dirs = listIndexDirs(cacheRoot);
  if (scope === 'all') return { turns: dirs.flatMap(readIndexDocs), sources: dirs, project: '' };

  const project = (sessionID && resolveProjectForSession(dirs, sessionID)) || cwd;
  const sources = dirs.filter((dir) => {
    const meta = readIndexMeta(dir);
    return meta?.project === project || meta?.scope === 'all';
  });
  return { turns: sources.flatMap(readIndexDocs), sources, project };
}

function resolveProjectForSession(dirs, sessionID) {
  for (const dir of dirs) {
    const hit = readIndexDocs(dir).find((turn) => turn.session === sessionID);
    if (hit) return hit.project;
  }
  return undefined;
}

function renderHits(query, hits) {
  if (hits.length === 0) return `No matches for "${query}".`;
  const lines = [`${hits.length} match(es) for "${query}":`];
  for (const hit of hits) lines.push(`- ${hit.title || hit.session} [${hit.harness}] score ${hit.score}\n  ${hit.snippet}`);
  return lines.join('\n');
}
