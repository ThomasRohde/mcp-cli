import fs from 'node:fs';

export function parseArgsInput(options: { args?: string; argsFile?: string; argsStdin?: boolean }): unknown {
  const count = [options.args, options.argsFile, options.argsStdin ? '1' : undefined].filter(Boolean).length;
  if (count > 1) throw new Error('Use only one of --args, --args-file, or --args-stdin');
  let raw = '{}';
  if (options.args) raw = options.args;
  else if (options.argsFile) raw = fs.readFileSync(options.argsFile, 'utf8');
  else if (options.argsStdin) raw = fs.readFileSync(0, 'utf8');

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON input');
  }
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/authorization|token|secret/i.test(k)) out[k] = '***REDACTED***';
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
}
