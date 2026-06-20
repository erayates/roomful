// @vitest-environment node

import type { Peer, PresenceData } from '@cahoots/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { usePresenceMock } = vi.hoisted(() => {
  const peers: Peer<PresenceData>[] = [
    {
      id: 'self',
      joinedAt: 1,
      lastSeen: 1,
      name: 'Ada Lovelace',
    },
    {
      id: 'peer-b',
      joinedAt: 1,
      lastSeen: 1,
      name: 'Bob Stone',
    },
  ];

  return {
    usePresenceMock: vi.fn(() => {
      return {
        self: peers[0],
        others: peers.slice(1),
        all: peers,
        update: vi.fn(),
        replace: vi.fn(),
      };
    }),
  };
});

vi.mock('@cahoots/react', () => {
  return {
    usePresence: usePresenceMock,
  };
});

import { PresenceAvatars, PresenceBar } from './index';

describe('Presence components SSR', () => {
  it('render to a string without browser-only globals', () => {
    const barHtml = renderToString(
      createElement(PresenceBar, {
        maxVisible: 1,
      }),
    );
    const avatarsHtml = renderToString(
      createElement(PresenceAvatars, {
        maxVisible: 1,
      }),
    );

    expect(barHtml).toContain('data-cahoots-presence-bar="true"');
    expect(barHtml).toContain('Ada Lovelace');
    expect(avatarsHtml).toContain('data-cahoots-presence-avatars="true"');
    expect(avatarsHtml).toContain('+1');
  });
});
