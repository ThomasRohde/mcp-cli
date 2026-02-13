# mcp-cli

A universal CLI for working with **Model Context Protocol (MCP)** servers from your terminal, CI jobs, and automation scripts.

`mcp-cli` lets you:

- list configured MCP servers,
- fetch and inspect available tools,
- search tools by relevance (`tool-search`) to reduce context bloat,
- call tools with JSON arguments from inline text, files, or stdin.

Built with TypeScript and designed to work with both:

- **stdio transport** (spawn an MCP server process locally), and
- **HTTP transport** (JSON-RPC over HTTP).

---

## Why this exists

When many tools are available, sending every tool schema to an LLM or automation pipeline can be wasteful. `mcp-cli` includes a practical `tool-search` command that ranks tools locally and returns only the top matches (with optional schema limiting), so your workflows stay lean and predictable.

---

## Installation

### Prerequisites

- Node.js **18+**
- npm

### From source (this repository)

```bash
npm install
npm run build
```

Run directly from source in dev mode:

```bash
npm run dev -- --help
```

Or run the built CLI:

```bash
node dist/index.js --help
```

If installed globally (or linked), the executable name is:

```bash
mcp
```

---

## Quick start

1. Create a global config in `~/.mcp-cli/config.json`.
2. Define at least one server.
3. Run:

```bash
mcp servers
mcp tools --server <name>
mcp tool-search "create pull request" --server <name>
```

---

## Configuration

`mcp-cli` reads configuration from:

1. global: `~/.mcp-cli/`
2. project-local: `./mcp-cli/` (overrides global)

Supported config files (first match in each directory):

- `config.json`
- `config.yaml`
- `config.yml`

### Example config

```json
{
  "defaultServer": "demo-http",
  "strictEnv": false,
  "servers": {
    "demo-http": {
      "transport": "http",
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_DEMO_TOKEN}"
      },
      "timeoutMs": 60000,
      "summary": "Demo HTTP MCP server"
    },
    "demo-stdio": {
      "transport": "stdio",
      "command": "node",
      "args": ["./servers/demo/build/index.js"],
      "cwd": "${PWD}",
      "env": {
        "DEMO_TOKEN": "${DEMO_TOKEN}"
      },
      "summary": "Demo stdio MCP server"
    }
  },
  "cache": {
    "enabled": true,
    "ttlSeconds": 300,
    "maxOutputBytes": 262144
  },
  "toolSearch": {
    "defaultLimit": 5,
    "defaultSchemas": 3
  }
}
```

### Environment variable expansion

Any string value can use `${VAR}` placeholders.

- If `strictEnv: true`, missing variables cause an error.
- If `strictEnv: false` (default), unresolved placeholders are left as-is.

### Selecting a server

Server selection precedence:

1. `--server <name>`
2. `MCP_CLI_SERVER` environment variable
3. `defaultServer` from config

---

## CLI reference

Global options:

- `--server <name>`
- `--output <format>` (`json|text`)
- `--pretty`
- `--config-dir <path>`
- `--no-cache`
- `--cache-ttl <seconds>`

### `mcp servers`

List configured servers.

Text output:

```text
<name>\t<transport>\t<summary>
```

JSON output:

```json
{ "servers": [ ... ] }
```

---

### `mcp tools`

List tools available on the selected server.

Examples:

```bash
mcp tools --server demo-http
mcp tools --server demo-http --output json --pretty
```

---

### `mcp describe <toolName>`

Return details for a single tool.

Example:

```bash
mcp describe github.createPullRequest --server github --pretty
```

---

### `mcp tool-search <query>`

Rank tools by relevance and return a compact JSON payload.

Options:

- `--limit <n>`
- `--schemas <n>`
- `--no-schemas`
- `--explain`

Examples:

```bash
mcp tool-search "create jira ticket" --server jira
mcp tool-search "open pull request" --server github --limit 5 --schemas 2 --explain --pretty
```

Notes:

- By default, only top schema entries are included to keep output small.
- If output exceeds configured max size, schemas/results are truncated and a warning is emitted.

---

### `mcp call <toolName>`

Call a tool with JSON input.

Input modes (exactly one):

- `--args '{"k":"v"}'`
- `--args-file ./payload.json`
- `--args-stdin`

Examples:

```bash
mcp call jira.createIssue --server jira --args '{"project":"ENG","summary":"Bug report"}'
cat payload.json | mcp call jira.createIssue --server jira --args-stdin
```

---

## Caching behavior

Tool lists are cached per server to improve repeat performance.

- Default location:
  - Linux/macOS: `${XDG_CACHE_HOME:-~/.cache}/mcp-cli`
  - Windows: `%LOCALAPPDATA%\\mcp-cli`
- Default TTL: `300` seconds
- Disable per command: `--no-cache`
- Override TTL: `--cache-ttl <seconds>`

---

## Output behavior

- `tool-search` and `call` always emit JSON.
- `servers` and `tools` support text and JSON output.
- `--pretty` formats JSON with indentation.

---

## Exit behavior

- The CLI sets non-zero exit codes on errors.
- `describe` sets exit code `2` when a tool is not found.
- Invalid JSON passed to `call` argument options returns an input error.

---

## Development

```bash
npm install
npm test
npm run build
```

Project layout:

- `src/index.ts` — CLI commands and option wiring
- `src/config.ts` — config loading, merge precedence, env expansion
- `src/client.ts` — stdio/HTTP JSON-RPC client transports
- `src/search.ts` — local relevance scoring/ranking
- `src/cache.ts` — tool list cache
- `src/io.ts` — argument parsing helpers
- `test/*.ts` — unit tests (Vitest)

---

## Troubleshooting

- **“No server selected”**: pass `--server`, set `MCP_CLI_SERVER`, or set `defaultServer`.
- **“Server not found in config”**: verify merged config contains that server name.
- **HTTP call errors**: verify `url`, headers, and server availability.
- **stdio call errors**: verify `command`, `args`, `cwd`, and environment variables.
- **JSON input errors**: validate payload syntax and ensure only one of `--args`, `--args-file`, `--args-stdin` is used.

---

## License

No license file is currently included in this repository.
