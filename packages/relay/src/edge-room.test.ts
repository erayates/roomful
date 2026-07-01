import { describe, expect, it } from 'vitest';

import { type EdgeConnection, EdgeRoom } from './edge-room.js';

const ROOM = 'room-a';

class MockConnection implements EdgeConnection {
  public readonly sent: Array<string | Uint8Array> = [];

  public closed: { code: number; reason: string } | null = null;

  public send(data: string | Uint8Array): void {
    this.sent.push(data);
  }

  public close(code: number, reason: string): void {
    this.closed = { code, reason };
  }

  public messages(): any[] {
    return this.sent.map((data) =>
      typeof data === 'string' ? JSON.parse(data) : JSON.parse(new TextDecoder().decode(data)),
    );
  }

  public last(): any {
    const messages = this.messages();
    return messages[messages.length - 1];
  }

  public hasType(type: string): boolean {
    return this.messages().some((message) => message.type === type);
  }
}

function joinFrame(peerId: string, options?: { roomId?: string; maxPeers?: number }): string {
  return JSON.stringify({
    type: 'join',
    roomId: options?.roomId ?? ROOM,
    peerId,
    ...(options?.maxPeers !== undefined ? { maxPeers: options.maxPeers } : {}),
  });
}

function leaveFrame(peerId: string): string {
  return JSON.stringify({ type: 'leave', roomId: ROOM, peerId });
}

function transportFrame(fromPeerId: string, toPeerId?: string): string {
  return JSON.stringify({
    type: 'transport',
    message: {
      source: 'roomful',
      protocolVersion: 2,
      codec: 'json',
      roomId: ROOM,
      fromPeerId,
      ...(toPeerId !== undefined ? { toPeerId } : {}),
      timestamp: 1,
      type: 'event',
      payload: { name: 'ping', payload: { ok: true } },
    },
  });
}

async function joinedRoom(...peerIds: string[]): Promise<{
  room: EdgeRoom;
  connections: Map<string, MockConnection>;
}> {
  const room = new EdgeRoom({ roomId: ROOM });
  const connections = new Map<string, MockConnection>();
  for (const peerId of peerIds) {
    const connection = new MockConnection();
    connections.set(peerId, connection);
    await room.handleMessage(connection, joinFrame(peerId));
  }
  return { room, connections };
}

describe('EdgeRoom', () => {
  it('acknowledges a join and lists existing peers', async () => {
    const room = new EdgeRoom({ roomId: ROOM });
    const a = new MockConnection();

    await room.handleMessage(a, joinFrame('a'));

    expect(a.last()).toMatchObject({ type: 'joined', roomId: ROOM, peerId: 'a', peers: [] });
    expect(room.size).toBe(1);
  });

  it('notifies existing peers and lists them for the joiner', async () => {
    const { connections } = await joinedRoom('a', 'b');

    expect(connections.get('b')?.last().peers).toEqual([{ peerId: 'a' }]);
    const peerJoined = connections
      .get('a')
      ?.messages()
      .find((message) => message.type === 'peer-joined');
    expect(peerJoined).toMatchObject({ peerId: 'b', roomId: ROOM });
  });

  it('broadcasts peer-left on an explicit leave', async () => {
    const { room, connections } = await joinedRoom('a', 'b');

    await room.handleMessage(connections.get('b')!, leaveFrame('b'));

    expect(connections.get('a')?.hasType('peer-left')).toBe(true);
    expect(room.size).toBe(1);
  });

  it('broadcasts peer-left when a connection is removed (socket close)', async () => {
    const { room, connections } = await joinedRoom('a', 'b');

    room.removeConnection(connections.get('b')!);

    const left = connections
      .get('a')
      ?.messages()
      .find((message) => message.type === 'peer-left');
    expect(left).toMatchObject({ peerId: 'b' });
    expect(room.size).toBe(1);
  });

  it('rejects joins beyond the room capacity', async () => {
    const room = new EdgeRoom({ roomId: ROOM, maxRoomSize: 1 });
    const a = new MockConnection();
    const b = new MockConnection();

    await room.handleMessage(a, joinFrame('a'));
    await room.handleMessage(b, joinFrame('b'));

    expect(b.last()).toMatchObject({ type: 'error', code: 'ROOM_FULL' });
    expect(room.size).toBe(1);
  });

  it('rejects a duplicate peer id', async () => {
    const room = new EdgeRoom({ roomId: ROOM });
    const first = new MockConnection();
    const second = new MockConnection();

    await room.handleMessage(first, joinFrame('a'));
    await room.handleMessage(second, joinFrame('a'));

    expect(second.last()).toMatchObject({ type: 'error', code: 'DUPLICATE_PEER' });
    expect(room.size).toBe(1);
  });

  it('rejects a join when authorization returns false', async () => {
    const room = new EdgeRoom({ roomId: ROOM, authorize: () => false });
    const a = new MockConnection();

    await room.handleMessage(a, joinFrame('a'), 'token');

    expect(a.last()).toMatchObject({ type: 'error', code: 'AUTH_FAILED' });
    expect(a.closed).toEqual({ code: 4401, reason: 'auth-failed' });
    expect(room.size).toBe(0);
  });

  it('rejects a join when authorization throws', async () => {
    const room = new EdgeRoom({
      roomId: ROOM,
      authorize: () => {
        throw new Error('nope');
      },
    });
    const a = new MockConnection();

    await room.handleMessage(a, joinFrame('a'), 'token');

    expect(a.last()).toMatchObject({ type: 'error', code: 'AUTH_FAILED' });
    expect(room.size).toBe(0);
  });

  it('rejects signaling before joining', async () => {
    const room = new EdgeRoom({ roomId: ROOM });
    const a = new MockConnection();

    await room.handleMessage(a, transportFrame('a'));

    expect(a.last()).toMatchObject({ type: 'error', code: 'NOT_JOINED' });
  });

  it('rejects an unparseable frame', async () => {
    const room = new EdgeRoom({ roomId: ROOM });
    const a = new MockConnection();

    await room.handleMessage(a, 'not-json');

    expect(a.last()).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' });
  });

  it('rejects a join for a different room', async () => {
    const room = new EdgeRoom({ roomId: ROOM });
    const a = new MockConnection();

    await room.handleMessage(a, joinFrame('a', { roomId: 'other' }));

    expect(a.last()).toMatchObject({ type: 'error', code: 'ROOM_MISMATCH' });
    expect(room.size).toBe(0);
  });

  it('broadcasts a transport frame to every other peer', async () => {
    const { room, connections } = await joinedRoom('a', 'b', 'c');

    await room.handleMessage(connections.get('a')!, transportFrame('a'));

    expect(connections.get('b')?.hasType('transport')).toBe(true);
    expect(connections.get('c')?.hasType('transport')).toBe(true);
    expect(connections.get('a')?.hasType('transport')).toBe(false);
  });

  it('routes a targeted transport frame to only the addressed peer', async () => {
    const { room, connections } = await joinedRoom('a', 'b', 'c');

    await room.handleMessage(connections.get('a')!, transportFrame('a', 'b'));

    expect(connections.get('b')?.hasType('transport')).toBe(true);
    expect(connections.get('c')?.hasType('transport')).toBe(false);
  });

  it('rejects a transport frame that spoofs another sender', async () => {
    const { room, connections } = await joinedRoom('a');

    await room.handleMessage(connections.get('a')!, transportFrame('impostor'));

    expect(connections.get('a')?.last()).toMatchObject({ type: 'error', code: 'ROOM_MISMATCH' });
  });
});
