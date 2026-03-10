// @vitest-environment jsdom

import type { CursorData, PresenceData } from '@flockjs/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FlockProvider,
  useConnectionStatus,
  useCursors,
  usePresence,
  useSharedState,
} from './index';

type TestPresence = PresenceData & {
  color: string;
  name: string;
};

type MessageHandler = (event: MessageEvent<unknown>) => void;
type TrackedEventName = 'mousemove' | 'touchmove' | 'touchstart';

interface EventListenerCounts {
  add: number;
  remove: number;
}

const TRACKED_CURSOR_EVENTS = new Set<TrackedEventName>(['mousemove', 'touchmove', 'touchstart']);

let roomCounter = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextRoomId(prefix: string): string {
  roomCounter += 1;
  return `${prefix}-${Date.now()}-${roomCounter}`;
}

class TrackingBroadcastChannel {
  private static channels = new Map<string, Set<TrackingBroadcastChannel>>();

  public static reset(): void {
    this.channels.clear();
  }

  public static getChannelCount(channelName: string): number {
    return this.channels.get(channelName)?.size ?? 0;
  }

  public static getTotalChannelCount(): number {
    let count = 0;
    for (const channelsForName of this.channels.values()) {
      count += channelsForName.size;
    }

    return count;
  }

  private static dispatch(
    channelName: string,
    payload: unknown,
    sender?: TrackingBroadcastChannel,
  ): void {
    const channelsForName = this.channels.get(channelName);
    if (!channelsForName) {
      return;
    }

    for (const channel of channelsForName) {
      if (channel.closed || channel === sender) {
        continue;
      }

      channel.emit(payload);
    }
  }

  private readonly listeners = new Set<MessageHandler>();

  private closed = false;

  public constructor(public readonly name: string) {
    const channelsForName =
      TrackingBroadcastChannel.channels.get(name) ?? new Set<TrackingBroadcastChannel>();
    channelsForName.add(this);
    TrackingBroadcastChannel.channels.set(name, channelsForName);
  }

  public addEventListener(type: string, handler: MessageHandler): void {
    if (type === 'message') {
      this.listeners.add(handler);
    }
  }

  public removeEventListener(type: string, handler: MessageHandler): void {
    if (type === 'message') {
      this.listeners.delete(handler);
    }
  }

  public postMessage(payload: unknown): void {
    if (this.closed) {
      return;
    }

    TrackingBroadcastChannel.dispatch(this.name, payload, this);
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    const channelsForName = TrackingBroadcastChannel.channels.get(this.name);
    if (!channelsForName) {
      return;
    }

    channelsForName.delete(this);
    if (channelsForName.size === 0) {
      TrackingBroadcastChannel.channels.delete(this.name);
    }
  }

  private emit(payload: unknown): void {
    const event = { data: payload } as MessageEvent<unknown>;
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

const originalBroadcastChannel = globalThis.BroadcastChannel;

function createPresence(name: string, color: string): TestPresence {
  return {
    name,
    color,
  };
}

function createStateValue(count: number): { count: number } {
  return {
    count,
  };
}

function withProviders(
  roomId: string,
  includeSecondProvider: boolean,
  primaryChild: ReturnType<typeof createElement>,
  secondaryChild?: ReturnType<typeof createElement>,
): ReactElement {
  return createElement(
    'div',
    null,
    createElement(
      FlockProvider,
      {
        roomId,
        transport: 'broadcast',
        presence: createPresence('Alpha', '#111111'),
      },
      primaryChild,
    ),
    includeSecondProvider
      ? createElement(
          FlockProvider,
          {
            roomId,
            transport: 'broadcast',
            presence: createPresence('Beta', '#222222'),
          },
          secondaryChild ?? createElement('div', { 'data-testid': 'secondary-placeholder' }),
        )
      : null,
  );
}

function ConnectionProbe(): ReactElement {
  const status = useConnectionStatus();
  return createElement('output', { 'data-testid': 'connection-status' }, status);
}

function PresenceProbe(props: {
  label: string;
  renderCounts: Record<string, number>;
}): ReactElement {
  const presence = usePresence<TestPresence>();
  props.renderCounts[props.label] = (props.renderCounts[props.label] ?? 0) + 1;

  return createElement(
    'section',
    { 'data-testid': `${props.label}-presence` },
    createElement('span', { 'data-testid': `${props.label}-self` }, presence.self.name ?? ''),
    createElement(
      'span',
      { 'data-testid': `${props.label}-others-count` },
      String(presence.others.length),
    ),
    createElement(
      'span',
      { 'data-testid': `${props.label}-others` },
      presence.others
        .map((peer) => {
          return peer.name ?? peer.id;
        })
        .join(','),
    ),
  );
}

function SharedStateProbe(props: { label: string }): ReactElement {
  const [value, setValue] = useSharedState('shared-counter', {
    initialValue: createStateValue(0),
    persist: false,
  });

  return createElement(
    'section',
    { 'data-testid': `${props.label}-shared-state` },
    createElement('span', { 'data-testid': `${props.label}-count` }, String(value.count)),
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          setValue((previous) => {
            return createStateValue(previous.count + 1);
          });
        },
      },
      `increment-${props.label}`,
    ),
  );
}

function CompositeHookProbe(): ReactElement {
  const presence = usePresence<TestPresence>();
  const [value] = useSharedState('cleanup-counter', {
    initialValue: createStateValue(0),
    persist: false,
  });
  const { cursors, ref } = useCursors<CursorData>();
  const status = useConnectionStatus();

  return createElement(
    'section',
    { 'data-testid': 'composite-hooks' },
    createElement('span', { 'data-testid': 'composite-status' }, status),
    createElement('span', { 'data-testid': 'composite-self' }, presence.self.name ?? ''),
    createElement('span', { 'data-testid': 'composite-count' }, String(value.count)),
    createElement('span', { 'data-testid': 'composite-cursors' }, String(cursors.length)),
    createElement('div', {
      id: 'composite-board',
      ref,
      style: {
        height: '120px',
        width: '240px',
      },
    }),
  );
}

function createElementEventTracker(targetId: string): {
  getCounts(type: TrackedEventName): EventListenerCounts;
  restore(): void;
} {
  const counts = new Map<TrackedEventName, EventListenerCounts>();
  const originalAddEventListenerDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'addEventListener',
  );
  const originalRemoveEventListenerDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'removeEventListener',
  );
  const originalAddEventListener = originalAddEventListenerDescriptor?.value;
  const originalRemoveEventListener = originalRemoveEventListenerDescriptor?.value;

  HTMLElement.prototype.addEventListener = function addTrackedEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (
      this instanceof HTMLElement &&
      this.id === targetId &&
      TRACKED_CURSOR_EVENTS.has(type as TrackedEventName)
    ) {
      const trackedType = type as TrackedEventName;
      const existing = counts.get(trackedType) ?? {
        add: 0,
        remove: 0,
      };
      counts.set(trackedType, {
        add: existing.add + 1,
        remove: existing.remove,
      });
    }

    originalAddEventListener?.call(this, type, listener, options);
  };

  HTMLElement.prototype.removeEventListener = function removeTrackedEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    if (
      this instanceof HTMLElement &&
      this.id === targetId &&
      TRACKED_CURSOR_EVENTS.has(type as TrackedEventName)
    ) {
      const trackedType = type as TrackedEventName;
      const existing = counts.get(trackedType) ?? {
        add: 0,
        remove: 0,
      };
      counts.set(trackedType, {
        add: existing.add,
        remove: existing.remove + 1,
      });
    }

    originalRemoveEventListener?.call(this, type, listener, options);
  };

  return {
    getCounts(type: TrackedEventName): EventListenerCounts {
      return (
        counts.get(type) ?? {
          add: 0,
          remove: 0,
        }
      );
    },
    restore(): void {
      if (originalAddEventListenerDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'addEventListener',
          originalAddEventListenerDescriptor,
        );
      }
      if (originalRemoveEventListenerDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'removeEventListener',
          originalRemoveEventListenerDescriptor,
        );
      }
    },
  };
}

beforeEach(() => {
  TrackingBroadcastChannel.reset();
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    writable: true,
    value: TrackingBroadcastChannel as unknown as typeof BroadcastChannel,
  });
});

afterEach(() => {
  cleanup();
  TrackingBroadcastChannel.reset();
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    writable: true,
    value: originalBroadcastChannel,
  });
  window.localStorage.clear();
});

describe('React adapter integration', () => {
  it('mounts FlockProvider and connects successfully', async () => {
    const roomId = nextRoomId('react-provider-connect');
    const onConnect = vi.fn();
    const view = render(
      createElement(
        FlockProvider,
        {
          roomId,
          transport: 'broadcast',
          presence: createPresence('Ada', '#123456'),
          onConnect,
        },
        createElement(ConnectionProbe),
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('connection-status').textContent).toBe('connected');
    });
    await waitFor(() => {
      expect(onConnect).toHaveBeenCalledTimes(1);
    });
    expect(TrackingBroadcastChannel.getChannelCount(`flockjs:${roomId}`)).toBe(1);

    view.unmount();

    await waitFor(() => {
      expect(TrackingBroadcastChannel.getTotalChannelCount()).toBe(0);
    });
  });

  it('updates usePresence when a peer joins and leaves', async () => {
    const roomId = nextRoomId('react-presence-join');
    const renderCounts: Record<string, number> = {};
    const view = render(
      withProviders(
        roomId,
        false,
        createElement(PresenceProbe, {
          label: 'alpha',
          renderCounts,
        }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('alpha-self').textContent).toBe('Alpha');
    });
    expect(screen.getByTestId('alpha-others-count').textContent).toBe('0');

    view.rerender(
      withProviders(
        roomId,
        true,
        createElement(PresenceProbe, {
          label: 'alpha',
          renderCounts,
        }),
        createElement(PresenceProbe, {
          label: 'beta',
          renderCounts,
        }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('alpha-others-count').textContent).toBe('1');
      expect(screen.getByTestId('alpha-others').textContent).toContain('Beta');
    });

    const renderCountAfterJoin = renderCounts.alpha ?? 0;
    expect(renderCountAfterJoin).toBeGreaterThan(1);

    view.rerender(
      withProviders(
        roomId,
        false,
        createElement(PresenceProbe, {
          label: 'alpha',
          renderCounts,
        }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('alpha-others-count').textContent).toBe('0');
    });
    expect((renderCounts.alpha ?? 0) - renderCountAfterJoin).toBeGreaterThan(0);

    view.unmount();
    await waitFor(() => {
      expect(TrackingBroadcastChannel.getTotalChannelCount()).toBe(0);
    });
  });

  it('syncs useSharedState between two rendered components', async () => {
    const roomId = nextRoomId('react-shared-state');
    const view = render(
      withProviders(
        roomId,
        true,
        createElement(SharedStateProbe, { label: 'alpha' }),
        createElement(SharedStateProbe, { label: 'beta' }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId('alpha-count').textContent).toBe('0');
      expect(screen.getByTestId('beta-count').textContent).toBe('0');
    });

    fireEvent.click(screen.getByRole('button', { name: 'increment-alpha' }));

    await waitFor(() => {
      expect(screen.getByTestId('alpha-count').textContent).toBe('1');
      expect(screen.getByTestId('beta-count').textContent).toBe('1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'increment-beta' }));

    await waitFor(() => {
      expect(screen.getByTestId('alpha-count').textContent).toBe('2');
      expect(screen.getByTestId('beta-count').textContent).toBe('2');
    });

    view.unmount();
    await waitFor(() => {
      expect(TrackingBroadcastChannel.getTotalChannelCount()).toBe(0);
    });
  });

  it('cleans up hook subscriptions and cursor listeners on unmount', async () => {
    const roomId = nextRoomId('react-hook-cleanup');
    const eventTracker = createElementEventTracker('composite-board');
    const view = render(
      createElement(
        FlockProvider,
        {
          roomId,
          transport: 'broadcast',
          presence: createPresence('Cleanup', '#654321'),
        },
        createElement(CompositeHookProbe),
      ),
    );

    try {
      await waitFor(() => {
        expect(screen.getByTestId('composite-status').textContent).toBe('connected');
      });
      expect(screen.getByTestId('composite-self').textContent).toBe('Cleanup');

      view.unmount();

      await waitFor(() => {
        expect(TrackingBroadcastChannel.getTotalChannelCount()).toBe(0);
      });

      for (const eventName of TRACKED_CURSOR_EVENTS) {
        await waitFor(() => {
          const counts = eventTracker.getCounts(eventName);
          expect(counts.add).toBeGreaterThan(0);
          expect(counts.remove).toBe(counts.add);
        });
      }
    } finally {
      eventTracker.restore();
    }
  });

  it('does not leak tracked BroadcastChannel handles after repeated mount cycles', async () => {
    const roomId = nextRoomId('react-mount-cycles');
    const eventTracker = createElementEventTracker('composite-board');

    try {
      for (let cycle = 0; cycle < 20; cycle += 1) {
        const view = render(
          createElement(
            FlockProvider,
            {
              roomId,
              transport: 'broadcast',
              presence: createPresence(`Cycle-${cycle}`, '#0F0F0F'),
            },
            createElement(CompositeHookProbe),
          ),
        );

        await waitFor(() => {
          expect(screen.getByTestId('composite-status').textContent).toBe('connected');
        });
        expect(TrackingBroadcastChannel.getChannelCount(`flockjs:${roomId}`)).toBe(1);

        view.unmount();

        await waitFor(() => {
          expect(TrackingBroadcastChannel.getTotalChannelCount()).toBe(0);
        });
        await wait(5);
      }

      for (const eventName of TRACKED_CURSOR_EVENTS) {
        const counts = eventTracker.getCounts(eventName);
        expect(counts.add).toBe(counts.remove);
      }
    } finally {
      eventTracker.restore();
    }
  });
});
