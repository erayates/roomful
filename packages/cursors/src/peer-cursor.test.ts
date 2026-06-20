// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PeerCursor, type PeerCursorProps } from './index';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

function createProps(overrides: Partial<PeerCursorProps> = {}): PeerCursorProps {
  return {
    x: 0.25,
    y: 0.75,
    name: 'Ada',
    color: '#123456',
    idle: false,
    style: 'arrow' as const,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PeerCursor', () => {
  it('renders as a decorative absolute-positioned cursor with smooth movement styles', () => {
    const { container } = render(createElement(PeerCursor, createProps()));
    const root = container.firstElementChild;

    expect(root).not.toBeNull();
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.getAttribute('data-cahoots-peer-cursor-style')).toBe('arrow');
    expect(root?.getAttribute('data-cahoots-peer-cursor-color')).toBe('#123456');
    expect((root as HTMLElement).style.position).toBe('absolute');
    expect((root as HTMLElement).style.left).toBe('25%');
    expect((root as HTMLElement).style.top).toBe('75%');
    expect((root as HTMLElement).style.transition).toContain('left 120ms linear');
    expect((root as HTMLElement).style.transition).toContain('top 120ms linear');
    expect((root as HTMLElement).style.pointerEvents).toBe('none');
    expect(container.textContent).toContain('Ada');
  });

  it.each([
    ['arrow', 'arrow'],
    ['dot', 'dot'],
    ['pointer', 'pointer'],
  ] as const)('renders the %s marker SVG variant', (style, expectedStyle) => {
    const { container } = render(createElement(PeerCursor, createProps({ style })));

    const marker = container.querySelector('[data-cahoots-peer-cursor-marker="true"]');
    expect(marker).not.toBeNull();
    expect(marker?.tagName.toLowerCase()).toBe('svg');
    expect(marker?.getAttribute('data-cahoots-peer-cursor-marker-style')).toBe(expectedStyle);
  });

  it('waits 3 seconds after becoming idle before fading the label', async () => {
    vi.useFakeTimers();

    const { container, rerender } = render(createElement(PeerCursor, createProps()));
    const label = container.querySelector('[data-cahoots-peer-cursor-label="true"]');
    expect((label as HTMLElement).style.opacity).toBe('1');

    rerender(createElement(PeerCursor, createProps({ idle: true })));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });
    expect((label as HTMLElement).style.opacity).toBe('1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect((label as HTMLElement).style.opacity).toBe('0');
  });

  it('restores the label immediately when the peer becomes active again', async () => {
    vi.useFakeTimers();

    const { container, rerender } = render(createElement(PeerCursor, createProps({ idle: true })));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    const label = container.querySelector('[data-cahoots-peer-cursor-label="true"]');
    expect((label as HTMLElement).style.opacity).toBe('0');

    rerender(createElement(PeerCursor, createProps({ idle: false })));

    expect((label as HTMLElement).style.opacity).toBe('1');
  });

  it('updates marker and label colors inline', () => {
    const { container } = render(createElement(PeerCursor, createProps()));
    const root = container.firstElementChild;
    const label = container.querySelector('[data-cahoots-peer-cursor-label="true"]');

    expect(root?.getAttribute('data-cahoots-peer-cursor-color')).toBe('#123456');
    expect(label?.getAttribute('data-cahoots-peer-cursor-label-color')).toBe('#123456');
  });
});
