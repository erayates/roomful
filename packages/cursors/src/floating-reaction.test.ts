// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FloatingReaction, type FloatingReactionProps } from './index';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

function renderFloatingReaction(
  props: Partial<FloatingReactionProps> = {},
): ReturnType<typeof render> {
  return render(
    createElement(FloatingReaction, {
      emoji: 'X',
      x: 0.5,
      y: 0.5,
      ...props,
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FloatingReaction', () => {
  it('renders the emoji with animation styles at the correct normalized position', () => {
    const { container } = renderFloatingReaction({
      emoji: 'F',
      x: 0.25,
      y: 0.75,
    });

    const element = container.querySelector('[data-flockjs-floating-reaction="true"]');

    expect(element).not.toBeNull();
    expect((element as HTMLElement).style.left).toBe('25%');
    expect((element as HTMLElement).style.top).toBe('75%');
    expect((element as HTMLElement).style.animation).toContain(
      'flockjs-floating-reaction-float',
    );
    expect((element as HTMLElement).style.pointerEvents).toBe('none');
    expect((element as HTMLElement).style.animationDelay).toBe('0ms');
    expect(element?.textContent).toBe('F');
    expect(
      container.querySelector('[data-flockjs-floating-reaction-styles="true"]'),
    ).not.toBeNull();
  });

  it('clamps coordinates outside the 0-1 range', () => {
    const { container } = renderFloatingReaction({
      x: -0.2,
      y: 1.8,
    });

    const element = container.querySelector('[data-flockjs-floating-reaction="true"]');

    expect((element as HTMLElement).style.left).toBe('0%');
    expect((element as HTMLElement).style.top).toBe('100%');
  });

  it('honors animation delay and waits before removing itself', async () => {
    vi.useFakeTimers();
    const onAnimationEnd = vi.fn();

    const { container } = renderFloatingReaction({
      durationMs: 120,
      delayMs: 30,
      onAnimationEnd,
    });

    const element = container.querySelector('[data-flockjs-floating-reaction="true"]');
    expect((element as HTMLElement).style.animationDelay).toBe('30ms');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    expect(container.querySelector('[data-flockjs-floating-reaction="true"]')).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });

    expect(onAnimationEnd).toHaveBeenCalledTimes(1);
    expect(container.firstChild).toBeNull();
  });
});
