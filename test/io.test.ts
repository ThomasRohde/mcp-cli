import { describe, expect, it } from 'vitest';
import { parseArgsInput } from '../src/io.js';

describe('parseArgsInput', () => {
  it('parses inline json', () => {
    expect(parseArgsInput({ args: '{"a":1}' })).toEqual({ a: 1 });
  });

  it('throws on invalid json', () => {
    expect(() => parseArgsInput({ args: '{' })).toThrow('Invalid JSON input');
  });
});
