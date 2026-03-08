import { describe, expect, expectTypeOf, it } from 'vitest';

import { createRoom } from './index';

interface PresenceShape {
  name: string;
  role: 'editor' | 'viewer';
  teamId: string;
}

interface CursorShape {
  tool: 'pen' | 'eraser';
  selectedIds: string[];
  metadata: {
    pressure: number;
  };
}

describe('Room generics', () => {
  it('propagates generic presence shape through Room and engines', async () => {
    const room = createRoom<PresenceShape>('room-generic-shape', {
      transport: 'broadcast',
      presence: {
        name: 'Alice',
        role: 'editor',
      },
    });

    const presence = room.usePresence();
    const cursors = room.useCursors<CursorShape>();
    const ydoc = room.getYDoc();
    const provider = room.getYProvider();

    expectTypeOf(room.peers).toEqualTypeOf<Array<Partial<PresenceShape> & { id: string }>>();
    expectTypeOf(presence.getSelf().role).toEqualTypeOf<'editor' | 'viewer' | undefined>();
    expectTypeOf(cursors.getPositions()[0]?.tool).toEqualTypeOf<'pen' | 'eraser' | undefined>();
    expectTypeOf(cursors.getPositions()[0]?.metadata)
      .toEqualTypeOf<{ pressure: number } | undefined>();
    expectTypeOf(ydoc.clientID).toEqualTypeOf<number>();
    expectTypeOf(provider.synced).toEqualTypeOf<boolean>();

    await room.connect();
    presence.update({
      teamId: 'alpha',
    });
    cursors.setPosition({
      tool: 'pen',
      selectedIds: ['shape-1'],
      metadata: {
        pressure: 0.75,
      },
    });

    const unsubscribe = cursors.subscribe((positions) => {
      expectTypeOf(positions[0]?.selectedIds).toEqualTypeOf<string[] | undefined>();
    });

    expect(presence.getSelf().teamId).toBe('alpha');

    unsubscribe();
    await room.disconnect();
  });
});
