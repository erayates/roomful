import { describe, expect, it } from 'vitest';

import { configureDashboard, getConfig } from './client';

describe('configureDashboard', () => {
  it('stores and retrieves config', () => {
    configureDashboard({
      baseUrl: 'http://localhost:8787/api/v1',
      ownerId: 'test-owner',
      token: 'test-token',
    });
    const cfg = getConfig();
    expect(cfg.baseUrl).toBe('http://localhost:8787/api/v1');
    expect(cfg.ownerId).toBe('test-owner');
    expect(cfg.token).toBe('test-token');
  });
});
