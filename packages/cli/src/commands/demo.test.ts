import { describe, expect, it } from 'vitest';

import { parseDemoArgs } from './demo.js';

describe('parseDemoArgs', () => {
  it('returns default options with no args', () => {
    const result = parseDemoArgs([]);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.url).toBe('https://demo.roomful.dev');
    expect(result.open).toBe(true);
    expect(result.local).toBe(false);
  });

  it('parses --local flag', () => {
    const result = parseDemoArgs(['--local']);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.local).toBe(true);
  });

  it('parses --url option', () => {
    const result = parseDemoArgs(['--url', 'http://localhost:5173']);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.url).toBe('http://localhost:5173');
  });

  it('parses --no-open flag', () => {
    const result = parseDemoArgs(['--no-open']);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.open).toBe(false);
  });

  it('returns error for unknown options', () => {
    const result = parseDemoArgs(['--bogus']);
    expect('error' in result).toBe(true);
  });
});
