// @vitest-environment jsdom

import type { PresenceData } from '@cahoots/core';
import { CahootsProvider } from '@cahoots/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PresenceAvatars, PresenceBar } from './index';

type TestPresence = PresenceData & {
  color: string;
  name: string;
};

type MessageHandler = (event: MessageEvent<unknown>) => void;

let roomCounter = 0;

class TrackingBroadcastChannel {
  private static channels = new Map<string, Set<TrackingBroadcastChannel>>();

  public static reset(): void {
    this.channels.clear();
  }

  private static dispatch(
    channelName: string,
    payload: unknown,
    sender?: TrackingBroadcastChannel,
  ): void {
    const channels = this.channels.get(channelName);
    if (!channels) {
      return;
    }

    for (const channel of channels) {
      if (channel.closed || channel === sender) {
        continue;
      }

      channel.emit(payload);
    }
  }

  private readonly listeners = new Set<MessageHandler>();

  private closed = false;

  public constructor(public readonly name: string) {
    const channels =
      TrackingBroadcastChannel.channels.get(name) ?? new Set<TrackingBroadcastChannel>();
    channels.add(this);
    TrackingBroadcastChannel.channels.set(name, channels);
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
    const channels = TrackingBroadcastChannel.channels.get(this.name);
    if (!channels) {
      return;
    }

    channels.delete(this);
    if (channels.size === 0) {
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
    color,
    name,
  };
}

function nextRoomId(prefix: string): string {
  roomCounter += 1;
  return `${prefix}-${Date.now()}-${roomCounter}`;
}

function PresenceHarness(): ReactElement {
  return createElement(
    'div',
    null,
    createElement(PresenceBar, {
      maxVisible: 2,
    }),
    createElement(PresenceAvatars, {
      maxVisible: 1,
    }),
  );
}

function renderProviders(roomId: string, includeSecondProvider: boolean): ReactElement {
  return createElement(
    'div',
    null,
    createElement(
      CahootsProvider<TestPresence>,
      {
        roomId,
        transport: 'broadcast',
        presence: createPresence('Alpha', '#111111'),
      },
      createElement(PresenceHarness),
    ),
    includeSecondProvider
      ? createElement(
          CahootsProvider<TestPresence>,
          {
            roomId,
            transport: 'broadcast',
            presence: createPresence('Beta', '#222222'),
          },
          createElement('div'),
        )
      : null,
  );
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

describe('Presence components integration', () => {
  it('updates when peers join and leave through CahootsProvider presence', async () => {
    const roomId = nextRoomId('presence-components');
    const view = render(renderProviders(roomId, false));

    await waitFor(() => {
      expect(screen.queryByText('Alpha')).not.toBeNull();
    });

    view.rerender(renderProviders(roomId, true));

    await waitFor(() => {
      expect(screen.queryByText('Beta')).not.toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByText('+1')).not.toBeNull();
    });

    view.rerender(renderProviders(roomId, false));

    await waitFor(() => {
      expect(screen.queryByText('Beta')).toBeNull();
    });
  });
});
