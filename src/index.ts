#!/usr/bin/env node
import { Command } from 'commander';
import { readToolsCache, writeToolsCache } from './cache.js';
import { createClient } from './client.js';
import { resolveConfig, selectServerName } from './config.js';
import { parseArgsInput } from './io.js';
import { rankTools } from './search.js';
import type { ToolDefinition } from './types.js';

const program = new Command();
program
  .name('mcp')
  .option('--server <name>')
  .option('--output <format>', 'json|text')
  .option('--pretty')
  .option('--config-dir <path>')
  .option('--no-cache')
  .option('--cache-ttl <seconds>', '', (v) => Number(v));

function printResult(value: unknown, opts: { output?: string; pretty?: boolean }): void {
  const asJson = opts.output === 'json' || typeof value === 'object';
  if (asJson) console.log(JSON.stringify(value, null, opts.pretty ? 2 : 0));
  else console.log(String(value));
}

async function getTools(serverName: string, options: any, config = resolveConfig(options.configDir)): Promise<ToolDefinition[]> {
  const ttl = options.cacheTtl ?? config.cache?.ttlSeconds ?? 300;
  const useCache = options.cache !== false && config.cache?.enabled !== false;
  if (useCache) {
    const cached = readToolsCache(serverName, ttl);
    if (cached) return cached;
  }
  const client = createClient(config.servers[serverName]);
  const result = await client.listTools();
  await client.close();
  if (useCache) writeToolsCache(serverName, result.tools);
  return result.tools;
}

program
  .command('servers')
  .action(async () => {
    const options = program.opts();
    const config = resolveConfig(options.configDir);
    const servers = Object.entries(config.servers).map(([name, server]) => ({ name, transport: server.transport, summary: server.summary ?? '' }));
    if (options.output === 'json') printResult({ servers }, options);
    else servers.forEach((s) => console.log(`${s.name}\t${s.transport}\t${s.summary}`));
  });

program
  .command('tools')
  .action(async () => {
    const options = program.opts();
    const config = resolveConfig(options.configDir);
    const server = selectServerName(config, options.server);
    const tools = await getTools(server, options, config);
    if (options.output === 'json') printResult({ server, tools }, options);
    else tools.forEach((t) => console.log(`${t.name}\t${t.description ?? ''}`));
  });

program
  .command('describe <toolName>')
  .action(async (toolName) => {
    const options = program.opts();
    const config = resolveConfig(options.configDir);
    const server = selectServerName(config, options.server);
    const tools = await getTools(server, options, config);
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      process.exitCode = 2;
      throw new Error(`Tool not found: ${toolName}`);
    }
    printResult({ server, tool }, { ...options, output: options.output ?? 'json' });
  });

program
  .command('tool-search <query>')
  .option('--limit <n>', '', (v) => Number(v))
  .option('--schemas <n>', '', (v) => Number(v))
  .option('--no-schemas')
  .option('--explain')
  .action(async (query, cmdOpts) => {
    const options = { ...program.opts(), ...cmdOpts };
    const config = resolveConfig(options.configDir);
    const server = selectServerName(config, options.server);
    const tools = await getTools(server, options, config);
    const limit = options.limit ?? config.toolSearch?.defaultLimit ?? 5;
    const schemas = options.schemas ?? config.toolSearch?.defaultSchemas ?? 3;
    const ranked = rankTools(query, tools).slice(0, limit);
    const results = ranked.map((entry, i) => ({
      name: entry.tool.name,
      description: entry.tool.description,
      score: entry.score,
      schemaIncluded: options.schemas !== false && i < schemas,
      ...(options.schemas !== false && i < schemas ? { inputSchema: entry.tool.inputSchema } : {}),
      ...(options.explain ? { rationale: `score=${entry.score}` } : {})
    }));
    let payload: any = { query, server, results };
    const maxBytes = config.cache?.maxOutputBytes ?? 256 * 1024;
    while (Buffer.byteLength(JSON.stringify(payload)) > maxBytes && payload.results.length) {
      const idx = payload.results.findIndex((r: any) => r.inputSchema);
      if (idx >= 0) delete payload.results[idx].inputSchema;
      else payload.results.pop();
      payload.warning = 'Output truncated due to max output size';
    }
    printResult(payload, { ...options, output: 'json' });
  });

program
  .command('call <toolName>')
  .option('--args <json>')
  .option('--args-file <path>')
  .option('--args-stdin')
  .action(async (toolName, cmdOpts) => {
    const options = { ...program.opts(), ...cmdOpts };
    const config = resolveConfig(options.configDir);
    const server = selectServerName(config, options.server);
    const args = parseArgsInput(options);
    const client = createClient(config.servers[server]);
    const result = await client.callTool(toolName, args);
    await client.close();
    printResult(result, { ...options, output: 'json' });
  });

program.parseAsync().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = 1;
});
