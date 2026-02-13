import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ToolDefinition } from './types.js';

type CacheRecord = { updatedAt: number; tools: ToolDefinition[] };

function cacheRoot(): string {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'mcp-cli');
  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'mcp-cli');
}

function cacheFile(server: string): string {
  return path.join(cacheRoot(), `${server}.tools.json`);
}

export function readToolsCache(server: string, ttlSeconds: number): ToolDefinition[] | undefined {
  const file = cacheFile(server);
  if (!fs.existsSync(file)) return undefined;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheRecord;
  if (Date.now() - parsed.updatedAt > ttlSeconds * 1000) return undefined;
  return parsed.tools;
}

export function writeToolsCache(server: string, tools: ToolDefinition[]): void {
  const root = cacheRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(cacheFile(server), JSON.stringify({ updatedAt: Date.now(), tools }));
}
