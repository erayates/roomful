import { describe, expect, it } from 'vitest';

import { resolveDemoRuntimeConfig } from './demo-config';

describe('resolveDemoRuntimeConfig', () => {
  it('defaults to BroadcastChannel with no relay configured', () => {
    const config = resolveDemoRuntimeConfig({ hostname: 'demo.roomful.dev', search: '' });

    expect(config.transport).toBe('broadcast');
    expect(config.relayUrl).toBeUndefined();
    expect(config.transportLabel).toContain('second tab');
  });

  it('upgrades to the websocket relay when one is given via the query string', () => {
    const config = resolveDemoRuntimeConfig({
      hostname: 'demo.roomful.dev',
      search: '?relay=wss://relay.example.dev',
    });

    expect(config.transport).toBe('websocket');
    expect(config.relayUrl).toBe('wss://relay.example.dev/');
    expect(config.transportLabel).toContain('relay');
  });

  it('ignores a relay url that is not a websocket endpoint', () => {
    const config = resolveDemoRuntimeConfig({
      hostname: 'demo.roomful.dev',
      search: '?relay=https://not-a-relay.dev',
    });

    expect(config.transport).toBe('broadcast');
    expect(config.relayUrl).toBeUndefined();
  });
});
