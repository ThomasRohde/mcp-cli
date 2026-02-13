import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { CliConfig } from './types.js';

const serverSchema = z.object({
  transport: z.enum(['stdio', 'http']),
  summary: z.string().optional(),
  timeoutMs: z.number().optional(),
  headers: z.record(z.string()).optional(),
  url: z.string().optional(),
  sessionId: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional()
});

const configSchema = z.object({
  defaultServer: z.string().optional(),
  strictEnv: z.boolean().optional(),
  servers: z.record(serverSchema).default({}),
  cache: z
    .object({ enabled: z.boolean().optional(), ttlSeconds: z.number().optional(), maxOutputBytes: z.number().optional() })
    .optional(),
  toolSearch: z.object({ defaultLimit: z.number().optional(), defaultSchemas: z.number().optional() }).optional()
});

const configNames = ['config.json', 'config.yaml', 'config.yml'];

function readConfigDir(dir: string): CliConfig {
  for (const name of configNames) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = name.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw);
    return configSchema.parse(parsed);
  }
  return { servers: {} };
}

function expandValue(value: string, strictEnv: boolean): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, key) => {
    const got = process.env[key];
    if (got !== undefined) return got;
    if (strictEnv) throw new Error(`Missing environment variable: ${key}`);
    return `\${${key}}`;
  });
}

function expandObject<T>(obj: T, strictEnv: boolean): T {
  if (typeof obj === 'string') return expandValue(obj, strictEnv) as T;
  if (Array.isArray(obj)) return obj.map((it) => expandObject(it, strictEnv)) as T;
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = expandObject(v, strictEnv);
    return out as T;
  }
  return obj;
}

export function resolveConfig(configDir?: string): CliConfig {
  const globalDir = configDir ?? path.join(os.homedir(), '.mcp-cli');
  const localDir = path.join(process.cwd(), 'mcp-cli');
  const global = readConfigDir(globalDir);
  const local = readConfigDir(localDir);
  const strictEnv = local.strictEnv ?? global.strictEnv ?? false;

  const merged: CliConfig = {
    defaultServer: local.defaultServer ?? global.defaultServer,
    strictEnv,
    servers: { ...global.servers, ...local.servers },
    cache: { enabled: true, ttlSeconds: 300, maxOutputBytes: 256 * 1024, ...(global.cache ?? {}), ...(local.cache ?? {}) },
    toolSearch: { defaultLimit: 5, defaultSchemas: 3, ...(global.toolSearch ?? {}), ...(local.toolSearch ?? {}) }
  };

  return expandObject(merged, strictEnv);
}

export function selectServerName(config: CliConfig, server?: string): string {
  const selected = server ?? process.env.MCP_CLI_SERVER ?? config.defaultServer;
  if (!selected) throw new Error('No server selected. Use --server or configure defaultServer.');
  if (!config.servers[selected]) throw new Error(`Server not found in config: ${selected}`);
  return selected;
}
