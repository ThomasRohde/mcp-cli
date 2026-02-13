import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { ServerConfig, ToolDefinition } from './types.js';

type JsonRpcResponse = { id: number; result?: any; error?: { code: number; message: string; data?: any } };

abstract class BaseClient {
  private nextId = 1;
  protected async request(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    await this.send({ jsonrpc: '2.0', id, method, params });
    const response = await this.readResponse(id);
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }

  abstract send(payload: any): Promise<void>;
  abstract readResponse(id: number): Promise<JsonRpcResponse>;
  abstract close(): Promise<void>;

  listTools(): Promise<{ tools: ToolDefinition[] }> {
    return this.request('tools/list', {});
  }

  callTool(name: string, args: unknown): Promise<any> {
    return this.request('tools/call', { name, arguments: args });
  }
}

class StdioClient extends BaseClient {
  private pending = new Map<number, (msg: JsonRpcResponse) => void>();
  private buffer = '';
  private readonly child;

  constructor(private cfg: ServerConfig) {
    super();
    if (!cfg.command) throw new Error('stdio server missing command');
    this.child = spawn(cfg.command, cfg.args ?? [], {
      cwd: cfg.cwd,
      env: { ...process.env, ...(cfg.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    this.child.stdout.on('data', (chunk) => this.onData(chunk.toString('utf8')));
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd);
      const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lenMatch) {
        this.buffer = '';
        return;
      }
      const len = Number(lenMatch[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + len) return;
      const body = this.buffer.slice(start, start + len);
      this.buffer = this.buffer.slice(start + len);
      const msg = JSON.parse(body) as JsonRpcResponse;
      if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
        this.pending.get(msg.id)?.(msg);
        this.pending.delete(msg.id);
      }
    }
  }

  async send(payload: any): Promise<void> {
    const json = JSON.stringify(payload);
    const framed = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
    this.child.stdin.write(framed);
  }

  async readResponse(id: number): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for response')), this.cfg.timeoutMs ?? 60000);
      this.pending.set(id, (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });
  }

  async close(): Promise<void> {
    this.child.kill('SIGTERM');
    await once(this.child, 'exit').catch(() => undefined);
  }
}

class HttpClient extends BaseClient {
  private pending = new Map<number, JsonRpcResponse>();
  constructor(private cfg: ServerConfig) {
    super();
    if (!cfg.url) throw new Error('http server missing url');
  }

  async send(payload: any): Promise<void> {
    const res = await fetch(this.cfg.url!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.cfg.headers ?? {}) },
      body: JSON.stringify(payload)
    });
    const msg = (await res.json()) as JsonRpcResponse;
    if (typeof msg.id === 'number') this.pending.set(msg.id, msg);
  }

  async readResponse(id: number): Promise<JsonRpcResponse> {
    const msg = this.pending.get(id);
    if (!msg) throw new Error('No response from server');
    this.pending.delete(id);
    return msg;
  }

  async close(): Promise<void> {
    return;
  }
}

export function createClient(cfg: ServerConfig): BaseClient {
  if (cfg.transport === 'stdio') return new StdioClient(cfg);
  return new HttpClient(cfg);
}
