import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';

describe('resolveConfig', () => {
  it('merges global and local with local override', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-cli-test-'));
    const globalDir = path.join(base, 'global');
    const localDir = path.join(base, 'project', 'mcp-cli');
    fs.mkdirSync(globalDir, { recursive: true });
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, 'config.json'), JSON.stringify({ servers: { a: { transport: 'http', url: 'http://a' } } }));
    fs.writeFileSync(path.join(localDir, 'config.json'), JSON.stringify({ servers: { a: { transport: 'stdio', command: 'node' }, b: { transport: 'http', url: 'http://b' } } }));
    const old = process.cwd();
    process.chdir(path.join(base, 'project'));
    const cfg = resolveConfig(globalDir);
    process.chdir(old);
    expect(cfg.servers.a.transport).toBe('stdio');
    expect(cfg.servers.b.url).toBe('http://b');
  });
});
