import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { DemoExperience } from './demo-experience';
import type { DemoCanvasState } from './demo-types';

const updatePresence = vi.fn();
const emitPreview = vi.fn();
const usePresenceMock = vi.fn();
const useConnectionStatusMock = vi.fn();
const useCursorsMock = vi.fn();
const useSharedStateMock = vi.fn();
const useEventMock = vi.fn();

vi.mock('@flockjs/react', () => {
  return {
    useConnectionStatus: () => useConnectionStatusMock(),
    useCursors: () => useCursorsMock(),
    useEvent: () => useEventMock(),
    usePresence: () => usePresenceMock(),
    useSharedState: () => useSharedStateMock(),
  };
});

vi.mock('@flockjs/cursors', () => {
  return {
    LiveIndicator: () => <div data-testid="live-indicator" />,
    PeerCursor: (props: { name: string }) => <div data-testid="peer-cursor">{props.name}</div>,
    PresenceBar: () => <div data-testid="presence-bar">Presence Bar</div>,
  };
});

describe('DemoExperience', () => {
  beforeEach(() => {
    updatePresence.mockReset();
    emitPreview.mockReset();
    usePresenceMock.mockReturnValue({
      all: [
        {
          color: '#ff6b35',
          id: 'peer-self',
          joinedAt: 1,
          lastSeen: 1,
          name: 'Ada Orbit',
        },
        {
          color: '#1ea896',
          id: 'peer-remote',
          joinedAt: 2,
          lastSeen: 2,
          name: 'Remote Sketch',
        },
      ],
      others: [
        {
          color: '#1ea896',
          id: 'peer-remote',
          joinedAt: 2,
          lastSeen: 2,
          name: 'Remote Sketch',
        },
      ],
      replace: vi.fn(),
      self: {
        color: '#ff6b35',
        id: 'peer-self',
        joinedAt: 1,
        lastSeen: 1,
        name: 'Ada Orbit',
      },
      update: updatePresence,
    });
    useConnectionStatusMock.mockReturnValue('connected');
    useCursorsMock.mockReturnValue({
      cursors: [
        {
          color: '#1ea896',
          idle: false,
          name: 'Remote Sketch',
          userId: 'peer-remote',
          x: 0.5,
          xAbsolute: 320,
          y: 0.35,
          yAbsolute: 180,
        },
      ],
      ref: vi.fn(),
    });
    useSharedStateMock.mockReturnValue([
      {
        strokes: [
          {
            color: '#ff6b35',
            createdAt: 1,
            id: 'stroke-1',
            peerId: 'peer-self',
            points: [
              { x: 0.1, y: 0.1 },
              { x: 0.3, y: 0.3 },
            ],
            size: 0.006,
          },
        ],
        version: 1,
      } satisfies DemoCanvasState,
      vi.fn(),
    ]);
    useEventMock.mockReturnValue(emitPreview);
  });

  it('renders presence, stroke count, status, and remote cursors', () => {
    render(
      <DemoExperience
        canonicalBaseUrl="https://demo.flockjs.dev"
        identity={{ color: '#ff6b35', name: 'Ada Orbit' }}
        onIdentityChange={vi.fn()}
        roomLabel="2026-03-11 UTC"
      />,
    );

    expect(screen.getByTestId('connection-status').textContent).toBe('Connected live');
    expect(screen.getByTestId('room-label').textContent).toBe('2026-03-11 UTC');
    expect(screen.getByTestId('presence-count-value').textContent).toBe('2');
    expect(screen.getByTestId('stroke-count-value').textContent).toBe('1');
    expect(screen.getAllByTestId('peer-cursor')).toHaveLength(1);
    expect(screen.getByTestId('presence-bar').textContent).toContain('Presence Bar');
  });

  it('submits rename changes to local identity and live presence', () => {
    const onIdentityChange = vi.fn();

    render(
      <DemoExperience
        canonicalBaseUrl="https://demo.flockjs.dev"
        identity={{ color: '#ff6b35', name: 'Ada Orbit' }}
        onIdentityChange={onIdentityChange}
        roomLabel="2026-03-11 UTC"
      />,
    );

    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: '  Nora   Signal  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update live cursor' }));

    expect(onIdentityChange).toHaveBeenCalledWith({
      color: '#ff6b35',
      name: 'Nora Signal',
    });
    expect(updatePresence).toHaveBeenLastCalledWith({
      name: 'Nora Signal',
    });
  });
});
