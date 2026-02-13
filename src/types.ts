export type TransportType = 'stdio' | 'http';

export type ServerConfig = {
  transport: TransportType;
  summary?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  url?: string;
  sessionId?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type CliConfig = {
  defaultServer?: string;
  strictEnv?: boolean;
  servers: Record<string, ServerConfig>;
  cache?: {
    enabled?: boolean;
    ttlSeconds?: number;
    maxOutputBytes?: number;
  };
  toolSearch?: {
    defaultLimit?: number;
    defaultSchemas?: number;
  };
};

export type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};
