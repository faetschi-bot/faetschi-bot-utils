# session-search

Search your own coding-agent history. `session-search` reads local
[OpenCode](https://opencode.ai) and [Pi](https://pi.dev) sessions into a small
local index so you or your agent can ask *"where did we solve this before?"*

Works from the **CLI**, over **MCP**, or through a generated **OpenCode plugin /
Pi extension**.

## Quick start

```bash
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/session-search-latest/session-search.tgz
npx session-search index
npx session-search search "database is locked"
```

It indexes the signal — user/assistant text, reasoning, compaction summaries, and
tool **inputs** — and skips the noise: tool **outputs**, file contents, and
images are never indexed. Re-running `index` is incremental and cheap.

## Install

```bash
# per project (recommended)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/session-search-latest/session-search.tgz

# globally
npm i -g https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/session-search-latest/session-search.tgz

# vendored / submodule: copy the folder, then
cd session-search && npm install
node bin/session-search.mjs doctor
```

`session-search` has three small runtime deps (`minisearch`,
`@modelcontextprotocol/server`, `zod`). `doctor` and `index` work without them;
`search` and `mcp` need `npm install` once. Installing the tarball pulls them
from npm automatically.

## Commands

| Command | Purpose |
|---------|---------|
| `session-search index` | read session history into the local cache |
| `session-search search "<query>"` | search the cached history |
| `session-search show <sessionID>` | print one session's indexed turns |
| `session-search doctor` | check Node, cache, and detected sources |
| `session-search mcp` | run the MCP stdio server |
| `session-search install` | install the OpenCode/Pi adapter |

Common flags: `--harness opencode|pi|all`, `--project <dir>`, `--all`,
`--limit <n>`, `--recency <0..1>`, `--include-subagents`, `--pi-sessions <dir>`,
`--cache <dir>`, `--force`, `--progress`, `--json`. Run `session-search --help`
for the full list. Every command exits non-zero on failure.

## Examples

```bash
# search the current project
$ session-search search "rate limiter"
22.46  PROMPT: add a rate limiter to the API client  [opencode]
    …Add a RateLimiter token-bucket middleware keyed by API key; return 429 with Retry-After…
    session ses_f077ed5f…  assistant/action

# machine-readable
$ session-search search "rate limiter" --json
{ "ok": true, "query": "rate limiter", "scope": "project", "sources": ["opencode"],
  "results": [ { "session": "ses_f077ed5f…", "title": "PROMPT: add a rate limiter to the API client",
                 "score": 22.459, "snippet": "…add a rate limiter to the API client…",
                 "match": { "role": "assistant", "kind": "reasoning" } } ] }

# one session
$ session-search show ses_f077ed5f… --limit 5

# scope or tune
session-search index --harness opencode
session-search index --all --progress
session-search search "CORS" --include-subagents --limit 20
session-search search "docker image" --recency 0.3
```

`doctor --json` reports one entry per check (`node`, `cache`,
`opencode-source`, `pi-source`, `dependencies`, `redaction`, `scope`, `index`);
require `"ok": true`.

## Use it from OpenCode

```bash
npx session-search install --harness opencode
```

Writes `.opencode/plugins/session-search.js`, which registers **`history_search`**
and **`history_show`** tools, adds a **`/history`** command, and reindexes after a
session goes idle.

Prefer MCP only? Print the config with `npx session-search install --harness opencode --print`:

```jsonc
{ "mcp": { "servers": { "session_search": {
  "type": "local",
  "command": ["node", "node_modules/session-search/bin/session-search.mjs", "mcp"],
  "codemode": false
} } } }
```

Optionally gate it: `{ "permissions": [ { "action": "session_search_*", "resource": "*", "effect": "ask" } ] }`.

> OpenCode's `plugin add` rejects tarballs, so the plugin is installed as a file.
> Plugin-registered MCP servers connect but are not exposed to the model in
> v2.0.x, which is why the plugin registers native tools instead.

## Use it from Pi

```bash
npx session-search install --harness pi
```

Writes `.pi/extensions/session-search.ts`, which registers the MCP server
(`exposure: "direct"`), adds **`/history`**, and reindexes on `agent_settled`.

Prefer MCP only? `npx session-search install --harness pi --print`:

```json
{ "mcpServers": { "session_search": {
  "command": "node",
  "args": ["node_modules/session-search/bin/session-search.mjs", "mcp"],
  "exposure": "direct"
} } }
```

Pi 1.0 ships built-in MCP, so no extra extension is needed.

## MCP tools

Both are read-only. Successful calls return text plus `structuredContent`; error
paths (no index, session not found) return an `isError` text result.

- `history_search({ query, scope?, limit?, includeSubagents?, recency? })` →
  `{ count, truncated, hits: [...] }`
- `history_show({ session, limit? })` → `{ count, truncated, turns: [...] }`

When OpenCode calls a tool it sends the session id in
`_meta["ai.opencode/sessionID"]`; the server uses it to scope results to that
session's project. Pi scopes by cwd.

## How ranking works

- **BM25+** (MiniSearch, `k1=1.2 b=0.7 d=0.5`).
- **Code-aware tokenizer**: whole token + camelCase/snake_case subtokens + path
  suffixes, so `getUserById` and `user id` both match. No stemming.
- **Per-role weights**: title 3×, user 2.5×, assistant 1.5×, path 1.5×,
  reasoning 0.6×, action/tool/compaction 1×.
- **Chunking** on paragraphs/headings (~800 chars, 200 overlap), then **session
  aggregation** (top-3 chunks + match bonus) and **subagent collapse**.
- Optional weak recency: `--recency 0..1` (off by default).

## Evaluation

A frozen, offline corpus gates ranking quality in CI:

```bash
npm run eval          # fails if a category's NDCG@10 or Recall@10 drops >2 points
npm run eval:update   # rewrite the baseline after an intended change
```

Current baseline: **overall NDCG@10 0.9654** — symbol/path/command/temporal 1.0,
semantic 0.9307 (16 sessions, 24 stratified queries). The one miss is a
multi-target paraphrase query, i.e. the known semantic gap. `node eval/judge.mjs`
prints candidate pools for relabeling.

## Security & privacy

- **Redaction at index time** (API keys, tokens, private keys, `Authorization`
  headers, URL credentials), so secrets do not persist in the cache.
- **Tool inputs capped** at 2 KB per string and dialogue text at 20 KB;
  **tool outputs never indexed**.
- Default scope is the **current project** (`--all` to widen). Cache is
  **local-only**; nothing is uploaded.
- MCP results are framed as untrusted data. Redaction is best-effort — review
  before sharing.

## Cache & environment

Default cache: `~/.cache/session-search` (Linux, or `$XDG_CACHE_HOME`),
`~/Library/Caches/session-search` (macOS), `%LOCALAPPDATA%\session-search`
(Windows). Dirs are `0700`, files `0600` where POSIX modes exist.

| Variable | Effect |
|----------|--------|
| `SESSION_SEARCH_CACHE` | override the cache root |
| `PI_CODING_AGENT_SESSION_DIR` / `PI_CODING_AGENT_DIR` | Pi sessions location |
| `XDG_STATE_HOME` | where OpenCode's `service.json` lives |
| `SESSION_SEARCH_REQUIRE_UI=1` | Pi: require interactive confirmation for the tools |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `no index for project:…` | run `session-search index`; check `--project`/`--all` |
| `missing minisearch …` | run `npm install` in the tool directory |
| `registered … but not reachable` | start OpenCode |
| Pi sessions not found | set `--pi-sessions` or `PI_CODING_AGENT_DIR` |
| MCP tools missing after a schema change | restart OpenCode's service (or run OpenCode with `--standalone`); it caches the MCP catalog |
| Stale results | re-run `index`, or `--force` |

## Compatibility

`session-search` needs Node **≥ 20**. OpenCode **V2** (v2.0.18) is validated
live; the Pi adapter is built against **Pi 1.0.0**'s extension API and validated
against its session fixtures (Pi itself needs Node ≥ 22.19).

## Releasing

Do not tag by hand. Bump `session-search/package.json` and merge to `main`; the
release workflow publishes the tarball and refreshes the `-latest` pointer.

See [`AGENTS.md`](./AGENTS.md) for the agent-oriented guide.
