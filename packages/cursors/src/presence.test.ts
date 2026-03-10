// @vitest-environment jsdom

import type { Peer, PresenceData } from '@flockjs/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { replaceMock, setPeers, updateMock, usePresenceMock } = vi.hoisted(() => {
  let currentPeers: Peer<PresenceData>[] = [];
  const updateMock = vi.fn<(data: Partial<PresenceData>) => void>();
  const replaceMock = vi.fn<(data: Partial<PresenceData>) => void>();
  const usePresenceMock = vi.fn(() => {
    const self = currentPeers[0] ?? createPeer('self');
    return {
      self,
      others: currentPeers.filter((peer) => {
        return peer.id !== self.id;
      }),
      all: currentPeers,
      update: updateMock,
      replace: replaceMock,
    };
  });

  return {
    replaceMock,
    setPeers: (nextPeers: Peer<PresenceData>[]) => {
      currentPeers = nextPeers;
    },
    updateMock,
    usePresenceMock,
  };
});

vi.mock('@flockjs/react', () => {
  return {
    usePresence: usePresenceMock,
  };
});

import { PresenceAvatars, PresenceBar, type PresenceBarProps } from './index';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

function createPeer(id: string, overrides: Partial<Peer<PresenceData>> = {}): Peer<PresenceData> {
  return {
    id,
    joinedAt: 1,
    lastSeen: 1,
    name: id,
    ...overrides,
  };
}

function renderPresenceBar(
  props: Partial<PresenceBarProps> = {},
): ReturnType<typeof render> {
  return render(
    createElement(PresenceBar, {
      ...props,
    }),
  );
}

beforeEach(() => {
  setPeers([]);
  replaceMock.mockReset();
  updateMock.mockReset();
  usePresenceMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PresenceBar', () => {
  it('renders all peers from room presence, including the local user', () => {
    setPeers([
      createPeer('self', {
        name: 'Ada Lovelace',
      }),
      createPeer('peer-b', {
        name: 'Bob Stone',
      }),
    ]);

    const { container } = renderPresenceBar();
    const root = container.querySelector('[data-flockjs-presence-bar="true"]');

    expect(root).not.toBeNull();
    expect(screen.queryByText('Ada Lovelace')).not.toBeNull();
    expect(screen.queryByText('Bob Stone')).not.toBeNull();
    expect(
      container.querySelector('[data-flockjs-presence-peer="self"]')?.getAttribute('title'),
    ).toBe('Ada Lovelace');
    expect(
      container.querySelector('[data-flockjs-presence-peer="peer-b"]')?.getAttribute('title'),
    ).toBe('Bob Stone');
  });

  it('renders avatar images and initials fallbacks inside name chips', () => {
    setPeers([
      createPeer('self', {
        avatar: 'https://cdn.example.com/ada.png',
        name: 'Ada Lovelace',
      }),
      createPeer('peer-b', {
        color: '#654321',
        name: 'Grace Hopper',
      }),
    ]);

    const { container } = renderPresenceBar();
    const image = container.querySelector('[data-flockjs-presence-avatar-image="true"]');
    const fallback = container.querySelector('[data-flockjs-presence-avatar-fallback="true"]');

    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('https://cdn.example.com/ada.png');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toBe('GH');
  });

  it('hides extra peers behind a +N overflow chip', () => {
    setPeers([
      createPeer('self', { name: 'Ada Lovelace' }),
      createPeer('peer-b', { name: 'Bob Stone' }),
      createPeer('peer-c', { name: 'Carol Jones' }),
      createPeer('peer-d', { name: 'Dana Scott' }),
    ]);

    const { container } = renderPresenceBar({
      maxVisible: 2,
    });

    expect(screen.queryByText('Ada Lovelace')).not.toBeNull();
    expect(screen.queryByText('Bob Stone')).not.toBeNull();
    expect(screen.queryByText('Carol Jones')).toBeNull();
    expect(screen.queryByText('Dana Scott')).toBeNull();
    expect(container.querySelector('[data-flockjs-presence-overflow="true"]')?.textContent).toBe(
      '+2',
    );
    expect(
      container.querySelector('[data-flockjs-presence-overflow="true"]')?.getAttribute('title'),
    ).toBe('Carol Jones, Dana Scott');
  });

  it('calls onUserClick with the clicked peer', () => {
    setPeers([
      createPeer('self', { name: 'Ada Lovelace' }),
      createPeer('peer-b', { name: 'Bob Stone' }),
    ]);

    const onUserClick = vi.fn<(peer: Peer<PresenceData>) => void>();
    renderPresenceBar({
      onUserClick,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bob Stone' }));

    expect(onUserClick).toHaveBeenCalledTimes(1);
    expect(onUserClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'peer-b',
        name: 'Bob Stone',
      }),
    );
  });

  it('animates peers entering and leaving', async () => {
    vi.useFakeTimers();

    setPeers([
      createPeer('self', { name: 'Ada Lovelace' }),
    ]);

    const { container, rerender } = renderPresenceBar({
      onUserClick: vi.fn(),
    });

    setPeers([
      createPeer('self', { name: 'Ada Lovelace' }),
      createPeer('peer-b', { name: 'Bob Stone' }),
    ]);

    rerender(
      createElement(PresenceBar, {
        onUserClick: vi.fn(),
      }),
    );

    expect(
      container.querySelector('[data-flockjs-presence-peer="peer-b"]')?.getAttribute(
        'data-flockjs-presence-phase',
      ),
    ).toBe('entering');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });

    expect(
      container.querySelector('[data-flockjs-presence-peer="peer-b"]')?.getAttribute(
        'data-flockjs-presence-phase',
      ),
    ).toBe('entered');

    setPeers([
      createPeer('self', { name: 'Ada Lovelace' }),
    ]);

    rerender(
      createElement(PresenceBar, {
        onUserClick: vi.fn(),
      }),
    );

    expect(
      container.querySelector('[data-flockjs-presence-peer="peer-b"]')?.getAttribute(
        'data-flockjs-presence-phase',
      ),
    ).toBe('exiting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(container.querySelector('[data-flockjs-presence-peer="peer-b"]')).toBeNull();
  });
});

describe('PresenceAvatars', () => {
  it('renders visible avatar circles and a +N overflow badge', () => {
    setPeers([
      createPeer('self', { name: 'Ada Lovelace' }),
      createPeer('peer-b', { name: 'Bob Stone' }),
      createPeer('peer-c', { name: 'Carol Jones' }),
    ]);

    const { container } = render(
      createElement(PresenceAvatars, {
        maxVisible: 2,
      }),
    );

    const visiblePeers = Array.from(container.querySelectorAll('[data-flockjs-presence-peer]'));

    expect(container.querySelector('[data-flockjs-presence-avatars="true"]')).not.toBeNull();
    expect(visiblePeers).toHaveLength(2);
    expect(container.querySelector('[data-flockjs-presence-overflow="true"]')?.textContent).toBe(
      '+1',
    );
  });

  it('calls onUserClick for avatar circles', () => {
    setPeers([
      createPeer('self', { name: 'Ada Lovelace' }),
      createPeer('peer-b', { name: 'Bob Stone' }),
    ]);

    const onUserClick = vi.fn<(peer: Peer<PresenceData>) => void>();
    render(
      createElement(PresenceAvatars, {
        onUserClick,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }));

    expect(onUserClick).toHaveBeenCalledTimes(1);
    expect(onUserClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'self',
      }),
    );
  });
});
