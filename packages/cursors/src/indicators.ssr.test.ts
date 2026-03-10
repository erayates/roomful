// @vitest-environment node

import type { Peer, PresenceData } from '@flockjs/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LiveIndicator, TypingIndicator } from './index';

function createPeer(id: string, overrides: Partial<Peer<PresenceData>> = {}): Peer<PresenceData> {
  return {
    id,
    joinedAt: 1,
    lastSeen: 1,
    name: id,
    ...overrides,
  };
}

describe('Indicator components SSR', () => {
  it('render to a string without touching browser-only globals', () => {
    const typingHtml = renderToString(
      createElement(TypingIndicator, {
        peers: [
          createPeer('peer-a', { name: 'Ada Lovelace' }),
          createPeer('peer-b', { name: 'Bob Stone' }),
        ],
      }),
    );
    const liveHtml = renderToString(
      createElement(LiveIndicator, {
        color: '#10b981',
        size: 12,
      }),
    );

    expect(typingHtml).toContain('data-flockjs-typing-indicator="true"');
    expect(typingHtml).toContain('Ada Lovelace and Bob Stone are typing');
    expect(liveHtml).toContain('data-flockjs-live-indicator="true"');
    expect(liveHtml).toContain('aria-label="Live activity"');
  });
});
