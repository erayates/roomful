import { describe, expect, it } from 'vitest';

import { parseRelayArgs } from './relay.js';

describe('parseRelayArgs', () => {
  it('defaults to start command with port 8787', () => {
    const result = parseRelayArgs([]);
    expect('command' in result).toBe(true);
    if ('command' in result) {
      expect(result.command).toBe('start');
      expect(result.options.port).toBe(8787);
      expect(result.options.host).toBe('127.0.0.1');
    }
  });

  it('parses --port and --host', () => {
    const result = parseRelayArgs(['--port', '8080', '--host', '0.0.0.0']);
    if ('command' in result) {
      expect(result.options.port).toBe(8080);
      expect(result.options.host).toBe('0.0.0.0');
    }
  });

  it('parses --port= value syntax', () => {
    const result = parseRelayArgs(['--port=9090']);
    if ('command' in result) {
      expect(result.options.port).toBe(9090);
    }
  });

  it('parses --management-api flag', () => {
    const result = parseRelayArgs(['--management-api']);
    if ('command' in result) {
      expect(result.options.managementApi).toBe(true);
    }
  });

  it('parses --auth-secret and --cors-origin', () => {
    const result = parseRelayArgs(['--auth-secret', 'my-secret', '--cors-origin', '*']);
    if ('command' in result) {
      expect(result.options.authSecret).toBe('my-secret');
      expect(result.options.corsOrigin).toBe('*');
    }
  });

  it('returns help command for --help', () => {
    const result = parseRelayArgs(['--help']);
    if ('command' in result) {
      expect(result.command).toBe('help');
    }
  });

  it('returns error for unknown options', () => {
    const result = parseRelayArgs(['--unknown']);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Unknown option');
    }
  });
});
