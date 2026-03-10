// @vitest-environment jsdom

import type { Peer, PresenceData } from '@flockjs/core';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollaborationBadge } from './index';

function createPeer(id: string, overrides: Partial<Peer<PresenceData>> = {}): Peer<PresenceData> {
  return {
    id,
    joinedAt: 1,
    lastSeen: 1,
    name: id,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('CollaborationBadge', () => {
  it('renders an absolute-positioned badge from peer and position props', () => {
    const peer = createPeer('peer-b', {
      color: '#2244cc',
      name: 'Bob Stone',
    });
    const { container } = render(
      createElement(
        'div',
        {
          style: {
            position: 'relative',
          },
        },
        createElement(CollaborationBadge, {
          peer,
          position: {
            left: '24px',
            top: 12,
          },
        }),
      ),
    );

    const badge = container.querySelector('[data-flockjs-collaboration-badge="true"]');

    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('aria-label')).toBe('Bob Stone is editing');
    expect(badge?.getAttribute('data-flockjs-collaboration-badge-peer')).toBe('peer-b');
    expect(badge?.getAttribute('data-flockjs-collaboration-badge-color')).toBe('#2244cc');
    expect((badge as HTMLElement).style.position).toBe('absolute');
    expect((badge as HTMLElement).style.top).toBe('12px');
    expect((badge as HTMLElement).style.left).toBe('24px');
    expect(badge?.textContent).toContain('Bob Stone');
  });

  it('removes the badge DOM node on unmount and falls back to top-right positioning', () => {
    const { container, unmount } = render(
      createElement(
        'div',
        {
          style: {
            position: 'relative',
          },
        },
        createElement(CollaborationBadge, {
          peer: createPeer('peer-a', {
            color: '#123456',
            name: '',
          }),
        }),
      ),
    );

    const badge = container.querySelector('[data-flockjs-collaboration-badge="true"]');

    expect((badge as HTMLElement).style.top).toBe('0px');
    expect((badge as HTMLElement).style.right).toBe('0px');
    expect(badge?.textContent).toContain('peer-a');

    unmount();

    expect(container.querySelector('[data-flockjs-collaboration-badge="true"]')).toBeNull();
  });
});
