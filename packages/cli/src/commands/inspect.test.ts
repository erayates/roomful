import { describe, expect, it } from 'vitest';

import { parseInspectArgs } from './inspect.js';

describe('parseInspectArgs', () => {
  it('returns error when no room ID given', () => {
    const result = parseInspectArgs([]);
    expect('error' in result).toBe(true);
  });

  it('parses room ID from first argument', () => {
    const result = parseInspectArgs(['my-room']);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.roomId).toBe('my-room');
    expect(result.relayUrl).toBe('ws://127.0.0.1:8787');
  });

  it('parses --relay option', () => {
    const result = parseInspectArgs(['my-room', '--relay', 'ws://example.com:9090']);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.relayUrl).toBe('ws://example.com:9090');
  });

  it('parses --timeout option', () => {
    const result = parseInspectArgs(['my-room', '--timeout', '10000']);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.timeout).toBe(10000);
  });

  it('returns error for unknown options', () => {
    const result = parseInspectArgs(['my-room', '--bogus']);
    expect('error' in result).toBe(true);
  });
});
