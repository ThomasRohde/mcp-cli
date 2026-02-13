---
title: "mcp-cli: Universal MCP-to-CLI Harness (TypeScript)"
version: "1.0"
date: "2026-02-13"
status: "Draft"
owners:
  - "Thomas Klok Rohde"
---

# 1. Summary

`mcp-cli` is a universal command-line client for **Model Context Protocol (MCP)** servers. It connects to MCP servers over **stdio** or **Streamable HTTP**, lists and searches available tools, and invokes tools with JSON arguments—making *any* MCP server usable from shell scripts, CI, and coding agents that can run a CLI.

A key differentiator is **Tool Search**: instead of dumping all tool definitions up-front (high token + latency cost), `mcp-cli` can return only the *few* most relevant tools and their schemas, mirroring Anthropic’s “Tool Search Tool” pattern for reducing context consumption.

Why now: Anthropic has highlighted that once too many MCP servers are connected, **tool definitions + results can consume excessive tokens**, reducing agent efficiency, and proposes patterns like code execution and tool search to keep context lean. citeturn0search1turn0search11

# 2. Goals and non-goals

## Goals

1. **Universal MCP client as a CLI**
   - Support **stdio** and **Streamable HTTP** transports.
   - Work with any standards-compliant MCP server.

2. **Configuration-based server registry**
   - Read server definitions from:
     1) `~/.mcp-cli/` (global)  
     2) `./mcp-cli/` (project-local)  
     in that order, with project-local overriding global.
   - Zero per-invocation boilerplate (no need to pass `--http-url` / `--stdio-command` every time).

3. **Tool discovery & invocation**
   - List tools, describe a tool schema, and call tools.
   - Support JSON args from inline string, file, or stdin.

4. **Tool Search to minimize context**
   - Search tools by intent and return a small set (default 3–5) of relevant tool definitions/schemas.
   - Designed for LLM/agent consumption without “tool-schema bloat”. citeturn0search11turn0search0

5. **Scripting-friendly output**
   - JSON-first output (`--output json`) with stable structures.
   - Text output for humans where helpful (tabular lists).

6. **Safe defaults**
   - No shell injection footguns.
   - Redact secrets in logs; never print auth tokens unless explicitly requested.

## Non-goals

- Implementing an LLM agent loop or orchestrator (this CLI is a **tool runner**, not an agent).
- Providing a UI beyond the CLI.
- Auto-installing MCP servers (we may provide “recipes,” but not package management).
- Full prompt/resource APIs on day one (v1 focuses on Tools; Resources/Prompts can be added later).

# 3. Personas and primary use cases

## Personas

- **Developer (human)**: wants a single CLI to interact with many MCP servers.
- **Coding agent / CI job**: can run commands and parse JSON but does not implement MCP natively.

## Use cases

- “List tools offered by my Jira MCP server.”
- “Search which tool can ‘create pull request’.”
- “Call `archi.screenshot` with args from a YAML/JSON pipeline.”
- “In CI: run an MCP tool and gate the build on the result.”
- “Agent: use `tool-search` to load only 3–5 relevant tool schemas before calling.”

# 4. Background and rationale

Anthropic’s guidance on scaling tool use emphasizes that loading all tool definitions up-front can consume tens of thousands of tokens before work begins, and that a **Tool Search Tool** approach can keep only a small index/tool-search tool in context until specific tools are needed. citeturn0search11turn0search0

They also advocate “code execution” patterns to keep intermediate data out of the LLM context and managed in code. `mcp-cli` aligns with this by externalizing execution and returning only relevant outputs. citeturn0search1

MCP’s specification defines **stdio** and **Streamable HTTP** transports; Streamable HTTP uses HTTP POST/GET and can optionally use SSE for streaming multiple server messages. citeturn0search4

Implementation will use the official **TypeScript SDK** for MCP clients/transports. citeturn0search3turn0search5

# 5. Product requirements

## 5.1 CLI command surface (v1)

All commands support selecting a server by name (`--server <name>`) or via env var `MCP_CLI_SERVER`.

### `mcp servers`
List configured servers (merged view of global + local config).

- Output (text): `<name>\t<transport>\t<summary>`
- Output (json): `{ servers: [...] }`

### `mcp tools`
List tools available on the selected server.

Options:
- `--json` / `--output json|text`
- `--cache-ttl <seconds>` (default 300)
- `--no-cache`

### `mcp describe <toolName>`
Return the single tool definition (name, description, input schema).

### `mcp tool-search <query>`
Return a ranked list of tools relevant to an intent query, designed for agent consumption.

Default behavior:
- returns **top 5** tools (configurable)
- **includes schemas** by default only for the top N (default 3), to keep output small
- prints JSON only (text mode optional later)

Options:
- `--limit <n>` (default 5)
- `--schemas <n>` (default 3)  (how many results to include full schema for)
- `--no-schemas` (return only name+description)
- `--explain` (include scoring/rationale fields)

Rationale: mirrors Anthropic’s tool-search pattern (load only a few relevant schemas rather than everything). citeturn0search0turn0search11

### `mcp call <toolName>`
Call a tool with JSON arguments.

Argument input:
- `--args '{...}'` (inline JSON)
- `--args-file path.json`
- `--args-stdin` (read JSON from stdin)

Output:
- JSON result exactly as received from MCP client library
- `--compact` (optional) to strip large fields like verbose logs (configurable allowlist/denylist)

Exit codes:
- `0` success
- `2` tool not found / usage error
- `3` transport/connect error
- `4` tool call error (non-JSON-RPC success)
- `5` invalid JSON input

### `mcp ping`
Health check: connects and requests server capabilities (or `listTools` with `--limit 1` if needed).

## 5.2 Configuration

### Config directories and precedence

`mcp-cli` loads configuration from these directories in order:

1) `~/.mcp-cli/` (global)  
2) `./mcp-cli/` (project-local; overrides global)

Rules:
- If both exist, they are **merged**:
  - `servers.<name>` in project-local overrides global server with same name.
  - Lists are replaced by default (no deep merge), unless specified (see below).
- If neither exists, CLI still works in “explicit mode” using flags (`--http-url` / `--stdio-command`) but this is a secondary path.

### Config files

Supported filenames (first match wins per directory):
- `config.json`
- `config.yaml` / `config.yml` (optional in v1; JSON is required)

### JSON schema (v1)

```json
{
  "defaultServer": "archi",
  "servers": {
    "archi": {
      "transport": "http",
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_ARCHI_TOKEN}"
      },
      "timeoutMs": 60000
    },
    "github": {
      "transport": "stdio",
      "command": "node",
      "args": ["./servers/github/build/index.js"],
      "cwd": "${PWD}",
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  },
  "cache": {
    "enabled": true,
    "ttlSeconds": 300
  },
  "toolSearch": {
    "defaultLimit": 5,
    "defaultSchemas": 3
  }
}
```

Variable expansion:
- `${VAR}` expands from environment variables.
- Missing env vars:
  - default: leave literal and warn (do not fail) unless `strictEnv: true`.

Secrets handling:
- `headers.Authorization`, `env.*TOKEN*`, `env.*SECRET*` are treated as sensitive and redacted in logs.

## 5.3 Transport requirements

### stdio

- Spawn server process using configured `command`, `args`, optional `cwd`, and `env`.
- Support process lifecycle:
  - clean shutdown on exit
  - propagate server stderr to CLI stderr (prefix with server name), but optionally suppress with `--quiet-server-stderr`.

### Streamable HTTP

- Connect to MCP Streamable HTTP endpoint (URL).
- Support headers (auth) and optional session id.
- Must support server streaming/notifications when provided (SSE optional per spec). citeturn0search4

## 5.4 Tool Search (implementation requirements)

### Data source
- Primary: `listTools()` from MCP server.
- Cache per server (tool list + schemas), respecting TTL.

### Ranking algorithm (v1)
- Local ranking without external services:
  - tokenize query and tool name/description
  - score: exact name match > partial name match > description match
  - optional: BM25-like scoring (stretch goal)

### Output shape (JSON)
```json
{
  "query": "create jira ticket",
  "server": "jira",
  "results": [
    {
      "name": "jira.createIssue",
      "description": "Create a Jira issue",
      "score": 2,
      "schemaIncluded": true,
      "inputSchema": { "...": "..." }
    }
  ]
}
```

### Context-efficiency guardrails
- Hard cap output size in JSON mode:
  - default max 256 KB per command (configurable)
  - if exceeded: truncate schemas first, then truncate results with a warning field.

# 6. Non-functional requirements

1. **Cross-platform**: Windows 11, macOS, Linux.
2. **Node compatibility**: Node 18+.
3. **Deterministic JSON**: stable keys/order when feasible.
4. **Performance**:
   - tools listing from cache in < 50ms typical
   - uncached listTools dependent on server but should not add significant overhead.
5. **Security**:
   - never echo secrets by default
   - avoid command injection: do not evaluate shells; use spawn with args array.
6. **Observability**:
   - `--verbose` emits lifecycle logs (connect, cache hits, timing).
   - `--trace` optionally logs JSON-RPC frames (secrets redacted).

# 7. UX and ergonomics

Global flags:
- `--server <name>` select server
- `--output json|text` (default: text for list commands, json for call)
- `--pretty` pretty JSON
- `--config-dir <path>` (optional override)
- `--no-cache`, `--cache-ttl <seconds>`

Examples:

```bash
# list servers
mcp servers

# search tools (agent-friendly)
mcp --server jira tool-search "create issue in project ABC" --limit 5 --schemas 3

# call tool with args file
mcp --server archi call archi.screenshot --args-file ./args.json

# call with stdin args
echo '{"project":"ABC","summary":"Bug"}' | mcp --server jira call jira.createIssue --args-stdin
```

# 8. Technical approach

- Language: TypeScript
- CLI: `commander` or `yargs`
- Validation: `zod`
- MCP client: `@modelcontextprotocol/sdk` transports:
  - `StdioClientTransport`
  - `StreamableHTTPClientTransport` citeturn0search3turn0search5
- Cache storage:
  - `${XDG_CACHE_HOME:-~/.cache}/mcp-cli/<serverId>.tools.json` (Linux/macOS)
  - `%LOCALAPPDATA%\\mcp-cli\\` (Windows)
  - (fallback) `~/.cache/mcp-cli/`

# 9. Testing and acceptance criteria

## Automated tests
- Unit:
  - config merging and env expansion
  - tool-search ranking
  - JSON parsing (stdin/file/inline)
- Integration:
  - connect to a sample stdio MCP server
  - connect to a sample Streamable HTTP MCP server
  - verify listTools/callTool roundtrip

## Acceptance criteria (v1)
- Given global config only, `mcp servers/tools/call` works without extra flags.
- Given both global and local configs, local server definitions override global.
- `mcp tool-search` returns top N tools and includes schemas only for configured count.
- Works against at least one real stdio server and one real streamable HTTP server.
- Secrets are redacted in `--verbose/--trace`.

# 10. Milestones

- **MVP (v0.1)**
  - config load/merge
  - connect stdio + streamable HTTP
  - tools / describe / call
  - basic caching

- **v0.2**
  - tool-search command + output caps
  - improved ranking (BM25)
  - `--trace` with redaction

- **v1.0**
  - hardened error handling, docs, CI, release packaging (npm + standalone binaries)
  - optional YAML config
  - completion scripts (bash/zsh/pwsh)

# 11. Open questions (defaults chosen for now)

- Should tool definitions be cached *with* schemas, or name+desc only? (default: cache full listTools payload; truncate on output if needed)
- How to version/compat tool schema changes across server upgrades? (default: TTL-based refresh)
- Do we need a `resources` and `prompts` command set in v1? (default: post-v1)
