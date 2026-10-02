# session-search

Search your local AI coding-agent session history with plain lexical retrieval.
`session-search` reads sessions from [OpenCode](https://opencode.ai) and
[Pi](https://pi.dev) into a small, normalized local index, so an agent or a
human can ask "where did we solve this before?" without re-reading transcripts.

It indexes the **signal** and skips the noise:

| Tier | Content | Indexed |
|------|---------|---------|
| dialogue | user text, assistant text, reasoning, compaction summaries | yes |
| actions | tool name + input (and shell commands) | yes |
| outputs | tool results, file contents, images | **no** |

Tool outputs are roughly 87% of a typical history and are mostly repo noise, so
they are never indexed.

> **Status:** complete: `index`, `search`, `show`, the MCP server, and the
> OpenCode/Pi adapters. See the plan's increments in the PR history.

## Requirements

- **Node 20+**
- A local OpenCode service and/or a Pi sessions directory to read (optional;
  without either, `doctor` still passes and `index` reports a skip).
- The `minisearch` runtime dependency, installed by `npm install` (or by
  installing the release tarball).

## Install

```bash
# Released tarball (no npm registry account needed)
npm i -D https://github.com/faetschi-bot/faetschi-bot-utils/releases/download/session-search-latest/session-search.tgz
npx session-search doctor --json

# Vendored copy
cp -r session-search /path/to/project/tools/session-search
node tools/session-search/bin/session-search.mjs doctor

# Git submodule
git submodule add https://github.com/faetschi-bot/faetschi-bot-utils tools/faetschi-bot-utils
node tools/faetschi-bot-utils/session-search/bin/session-search.mjs doctor
```

## CLI

```text
session-search index [options]              read session history into the cache
session-search search "<query>" [options]   search the cached history
session-search show <sessionID> [options]   print one session's indexed turns
session-search doctor [options]             check Node, cache, and sources
session-search mcp                          run the MCP stdio server
session-search install [options]            install the OpenCode/Pi adapter
```

| Flag | Meaning |
|------|---------|
| `--harness <name>` | `opencode`, `pi`, or `all` (default: `all`) |
| `--project <dir>` | scope to sessions under this directory (default: cwd) |
| `--all` | use every project instead of the current one |
| `--limit <n>` | max results (search, default 10) or turns (show) |
| `--include-subagents` | keep child sessions instead of folding them into parents |
| `--pi-sessions <dir>` | Pi sessions directory (default: `~/.pi/agent/sessions`) |
| `--cache <dir>` | cache root (default: the platform cache dir) |
| `--no-redact` | do not redact secrets before writing the index |
| `--force` | rebuild even when the source fingerprint is unchanged |
| `--json` | print a machine-readable result |

```bash
$ npx session-search index --harness pi --json
{
  "ok": true,
  "cacheRoot": "/home/me/.cache/session-search",
  "scope": "project",
  "project": "/home/me/project",
  "results": [{ "harness": "pi", "status": "ok", "skipped": false, "turns": 812, "sessions": 14, "dir": "..." }]
}
```

`doctor --json` reports `ok`, the package version, and one entry per check
(`node`, `cache`, `opencode-source`, `pi-source`, `dependencies`). Missing
harnesses are a `skip`; a missing dependency is a `warn`, not a failure.

## Search

`search` builds an in-memory [MiniSearch](https://github.com/lucaong/minisearch)
index from the cached turns using **BM25+** (`k1=1.2`, `b=0.7`, `d=0.5`):

- A code-aware tokenizer emits the whole token plus case/digit subtokens and
  path-suffix tokens, so `getUserById` and `user id` both match.
- Fields are boosted: title 3×, path 1.5×, text/tool 1×.
- Long turns are chunked (~800 chars, 200 overlap) before scoring, then chunks
  are aggregated to sessions (sum of the top 3 chunk scores + a match bonus).
- Child/subagent sessions are folded into their parent unless they clearly
  outrank it; pass `--include-subagents` to keep them.

```bash
$ npx session-search search "rate limiter" --json
$ npx session-search search "why did the build fail" --limit 5
$ npx session-search show ses_f077ce740ffeMvHImfodIoDlm7
```

## Where the index lives

A rebuildable cache, never source of truth:

| Platform | Default root |
|----------|--------------|
| Linux | `$XDG_CACHE_HOME/session-search` or `~/.cache/session-search` |
| macOS | `~/Library/Caches/session-search` |
| Windows | `%LOCALAPPDATA%\session-search` |

Override with `--cache` or `SESSION_SEARCH_CACHE`. Directories are created
`0700` and index files `0600` where the platform supports POSIX modes. A
fingerprint of the source state avoids rebuilding an unchanged index; a lock
file prevents concurrent rebuilds.

## Security

Session history can contain secrets, file contents, and private URLs. Therefore:

- **Redaction happens at index time**, not only when printing, so secrets do not
  persist in the cache. The rule set covers common API keys, tokens, private
  keys, `Authorization` headers, and URL credentials.
- **Tool outputs are never indexed.**
- The default scope is the **current project**; indexing every project requires
  `--all`.
- The cache is local-only. Nothing is uploaded.

Review results before sharing them. Redaction is best-effort, not a guarantee.

## MCP server

Run the stdio server and point a harness at it:

```bash
npx session-search mcp
```

OpenCode (`opencode mcp add` or `opencode.json`):

```jsonc
{ "mcp": { "servers": { "session_search": {
  "type": "local",
  "command": ["node", "node_modules/session-search/bin/session-search.mjs", "mcp"],
  "codemode": false
} } } }
```

Pi (`pi mcp add` or `~/.pi/agent/mcp.json`):

```json
{ "mcpServers": { "session_search": {
  "command": "node",
  "args": ["node_modules/session-search/bin/session-search.mjs", "mcp"],
  "exposure": "direct"
} } }
```

Tools: `history_search` and `history_show`, both read-only. When OpenCode invokes
them it sends the calling session id in `_meta`; the server uses it to scope
results to that session's project even when the server cwd differs. Pi does not
send it, so scope falls back to the server cwd. Gate the tools with a permission
rule (OpenCode):

```jsonc
{ "permissions": [ { "action": "session_search_*", "resource": "*", "effect": "ask" } ] }
```

## Adapters

`session-search install` writes a small adapter that auto-registers the MCP
server, adds a `/history` command, and refreshes the index after a session
settles. The absolute CLI path is baked into the generated file.

```bash
npx session-search install --harness opencode           # project .opencode/plugins/
npx session-search install --harness pi --global        # ~/.pi/agent/extensions/
npx session-search install --harness all --force
npx session-search install --harness opencode --print   # MCP config instead
```

| Harness | Project | Global |
|---------|---------|--------|
| `opencode` | `.opencode/plugins/session-search.js` | `~/.config/opencode/plugins/session-search.js` |
| `pi` | `.pi/extensions/session-search.ts` | `~/.pi/agent/extensions/session-search.ts` |

OpenCode does not accept tarball targets in `opencode plugin add`, so the
adapter is installed as a file (or use `--print` for the config snippet). Pi
loads TypeScript directly; if a third-party extension replaced built-in MCP, use
`--print` and configure that extension's format instead.

## Evaluation

Retrieval quality is gated in CI against a frozen, committed corpus and query
set — no network and no LLM at gate time:

```bash
npm run eval          # fail if session NDCG@10 drops >2 points vs baseline
npm run eval:update   # rewrite eval/baseline.json after an intended change
node eval/judge.mjs   # offline: print candidate pools for relabeling
```

`eval/corpus/turns.jsonl` is a sanitized normalized corpus; `eval/queries.jsonl`
carries stratified queries (semantic / symbol / path / command / temporal) with
graded session labels. Metrics are session-level NDCG@10, Recall@10, and MRR@10.

## Releasing

Do not tag by hand. Bump `session-search/package.json` and merge to `main`; the
`Release session-search` workflow creates the `session-search-v<version>` tag
and GitHub Release, and refreshes the `session-search-latest` pointer.
