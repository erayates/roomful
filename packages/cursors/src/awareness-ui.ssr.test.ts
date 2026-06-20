// @vitest-environment node

import type { Peer, PresenceData } from '@cahoots/core';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CollaborationBadge, SelectionHighlight } from './index';

function createPeer(id: string, overrides: Partial<Peer<PresenceData>> = {}): Peer<PresenceData> {
  return {
    id,
    joinedAt: 1,
    lastSeen: 1,
    name: id,
    ...overrides,
  };
}

describe('Awareness UI SSR', () => {
  it('renders the badge and keeps selection highlighting inert during SSR', () => {
    const badgeHtml = renderToString(
      createElement(CollaborationBadge, {
        peer: createPeer('peer-a', {
          color: '#123456',
          name: 'Ada Lovelace',
        }),
        position: {
          right: 0,
          top: 0,
        },
      }),
    );
    const highlightHtml = renderToString(
      createElement(SelectionHighlight, {
        peer: createPeer('peer-b', {
          color: '#654321',
          name: 'Bob Stone',
        }),
        selection: {
          elementId: 'editor',
          from: 0,
          to: 3,
        },
      }),
    );

    expect(badgeHtml).toContain('data-cahoots-collaboration-badge="true"');
    expect(badgeHtml).toContain('Ada Lovelace');
    expect(highlightHtml).toBe('');
  });
});
