import type { ToolDefinition } from './types.js';

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
}

export function scoreTool(query: string, tool: ToolDefinition): number {
  const qTokens = tokenize(query);
  const name = tool.name.toLowerCase();
  const desc = (tool.description ?? '').toLowerCase();
  let score = 0;
  if (name === query.toLowerCase()) score += 100;
  for (const token of qTokens) {
    if (name.includes(token)) score += 10;
    if (desc.includes(token)) score += 4;
  }
  return score;
}

export function rankTools(query: string, tools: ToolDefinition[]): Array<{ tool: ToolDefinition; score: number }> {
  return tools
    .map((tool) => ({ tool, score: scoreTool(query, tool) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
}
