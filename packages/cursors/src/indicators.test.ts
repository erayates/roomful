// @vitest-environment jsdom

import type { Peer, PresenceData } from '@cahoots/core';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

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

afterEach(() => {
  cleanup();
});

describe('TypingIndicator', () => {
  it('renders nothing when no peers are typing', () => {
    const { container } = render(
      createElement(TypingIndicator, {
        peers: [],
      }),
    );

    expect(container.querySelector('[data-cahoots-typing-indicator="true"]')).toBeNull();
  });

  it('shows up to three peer names and summarizes the remaining count', () => {
    render(
      createElement(TypingIndicator, {
        peers: [
          createPeer('peer-a', { name: 'Ada Lovelace' }),
          createPeer('peer-b', { name: 'Bob Stone' }),
          createPeer('peer-c', { name: 'Grace Hopper' }),
          createPeer('peer-d', { name: 'Margaret Hamilton' }),
        ],
      }),
    );

    expect(screen.getByRole('status').textContent).toContain(
      'Ada Lovelace, Bob Stone, Grace Hopper, and 1 other are typing',
    );
    expect(screen.queryByText('Margaret Hamilton')).toBeNull();
  });

  it('allows the accessible label to be overridden and renders three animated dots', () => {
    const { container } = render(
      createElement(TypingIndicator, {
        ariaLabel: 'Teammates are composing a response',
        peers: [createPeer('peer-a', { name: 'Ada Lovelace' })],
      }),
    );

    const root = screen.getByRole('status');
    const dots = Array.from(container.querySelectorAll('[data-cahoots-typing-dot="true"]'));

    expect(root.getAttribute('aria-label')).toBe('Teammates are composing a response');
    expect(root.getAttribute('aria-live')).toBe('polite');
    expect(dots).toHaveLength(3);
    expect(dots[0]?.getAttribute('style')).toContain('animation: cahootsTypingDotPulse');
    expect(dots[1]?.getAttribute('style')).toContain('animation-delay: 0.2s');
    expect(dots[2]?.getAttribute('style')).toContain('animation-delay: 0.4s');
  });
});

describe('LiveIndicator', () => {
  it('renders a pulsing dot with configurable size, color, and label text', () => {
    const { container } = render(
      createElement(LiveIndicator, {
        ariaLabel: 'Live presence hotspot',
        color: '#ef4444',
        size: 14,
      }),
    );

    const root = screen.getByRole('img', { name: 'Live presence hotspot' });
    const core = container.querySelector('[data-cahoots-live-indicator-core="true"]');
    const pulse = container.querySelector('[data-cahoots-live-indicator-pulse="true"]');

    expect(root.getAttribute('data-cahoots-live-indicator')).toBe('true');
    expect(root.getAttribute('style')).toContain('width: 14px');
    expect(root.getAttribute('style')).toContain('height: 14px');
    expect(core?.getAttribute('style')).toContain('background-color: rgb(239, 68, 68)');
    expect(pulse?.getAttribute('style')).toContain('animation: cahootsLiveIndicatorPulse');
  });
});
