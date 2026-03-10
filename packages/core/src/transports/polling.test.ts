import { describe, expect, it } from 'vitest';

import {
  getBootstrapProtocolSession,
  getTransportProtocolCapabilities,
} from './transport.protocol';
import {
  createPollingTransportAdapter,
  type FetchLike,
  type FetchRequestInitLike,
  type FetchResponseLike,
} from './polling';
import {
  parseWebSocketRelayClientMessage,
  serializeWebSocketRelayMessage,
} from './websocket.protocol';

const textEncoder = new TextEncoder();

class MockHeaders {
  private readonly values = new Map<string, string>();

  public constructor(entries: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(entries)) {
      this.values.set(key.toLowerCase(), value);
    }
  }

  public get(name: string): string | null {
    return this.values.get(name.toLowerCase()) ?? null;
  }
}

class MockResponse implements FetchResponseLike {
  public readonly ok: boolean;

  public readonly headers: MockHeaders;

  public constructor(
    public readonly status: number,
    private readonly payload?: string | Uint8Array,
    headers: Record<string, string> = {},
  ) {
    this.ok = status >= 200 && status < 300;
    this.headers = new MockHeaders(headers);
  }

  public async text(): Promise<string> {
    if (typeof this.payload === 'string') {
      return this.payload;
    }

    return this.payload ? new TextDecoder().decode(this.payload) : '';
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.payload instanceof Uint8Array) {
      return this.payload.buffer.slice(
        this.payload.byteOffset,
        this.payload.byteOffset + this.payload.byteLength,
      );
    }

    return textEncoder.encode(this.payload ?? '').buffer;
  }
}

type PendingEventResolver = (response: MockResponse) => void;

interface SessionState {
  sessionId: string;
  roomId: string;
  peerId: string;
  protocol?: ReturnType<typeof getTransportProtocolCapabilities>;
  queue: Array<string | Uint8Array>;
  pendingResolvers: PendingEventResolver[];
}

class MockPollingRelay {
  private nextSessionId = 1;

  private readonly sessions = new Map<string, SessionState>();

  private readonly rooms = new Map<string, Map<string, SessionState>>();

  public readonly requests: Array<{
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string | Uint8Array;
  }> = [];

  public constructor(
    private readonly options: {
      rejectJoinCode?: string;
      rejectJoinMessage?: string;
    } = {},
  ) {}

  public readonly fetch: FetchLike = async (input: string, init?: FetchRequestInitLike) => {
    const method = init?.method ?? 'GET';
    const headers = init?.headers ?? {};
    this.requests.push({
      method,
      url: input,
      headers,
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });

    const url = new URL(input);
    if (method === 'POST' && url.pathname.endsWith('/poll/sessions')) {
      return this.handleJoin(init?.body, headers);
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const lastSegment = segments.at(-1);
    const secondLastSegment = segments.at(-2);
    if (!lastSegment) {
      return new MockResponse(404, JSON.stringify({ code: 'NOT_FOUND', message: 'Not Found.' }), {
        'content-type': 'application/json; charset=utf-8',
      });
    }

    if (method === 'GET' && lastSegment === 'events' && secondLastSegment) {
      return this.handleEvents(secondLastSegment);
    }

    if (method === 'POST' && lastSegment === 'messages' && secondLastSegment) {
      return this.handleTransportMessage(secondLastSegment, init?.body);
    }

    if (method === 'DELETE') {
      return this.handleDelete(lastSegment);
    }

    if (!secondLastSegment) {
      return new MockResponse(404, JSON.stringify({ code: 'NOT_FOUND', message: 'Not Found.' }), {
        'content-type': 'application/json; charset=utf-8',
      });
    }

    return new MockResponse(404, JSON.stringify({ code: 'NOT_FOUND', message: 'Not Found.' }), {
      'content-type': 'application/json; charset=utf-8',
    });
  };

  public getSession(peerId: string): SessionState | null {
    for (const session of this.sessions.values()) {
      if (session.peerId === peerId) {
        return session;
      }
    }

    return null;
  }

  private async handleJoin(
    body: string | Uint8Array | undefined,
    headers: Record<string, string>,
  ): Promise<MockResponse> {
    if (this.options.rejectJoinCode) {
      return new MockResponse(
        this.options.rejectJoinCode === 'ROOM_FULL' ? 409 : 401,
        JSON.stringify({
          code: this.options.rejectJoinCode,
          message: this.options.rejectJoinMessage ?? 'Rejected.',
        }),
        {
          'content-type': 'application/json; charset=utf-8',
        },
      );
    }

    const payload = typeof body === 'string' ? body : new TextDecoder().decode(body ?? new Uint8Array());
    const message = parseWebSocketRelayClientMessage(payload);
    if (!message || message.type !== 'join') {
      return new MockResponse(400, JSON.stringify({ code: 'INVALID_MESSAGE', message: 'Invalid join.' }), {
        'content-type': 'application/json; charset=utf-8',
      });
    }

    const session: SessionState = {
      sessionId: `session-${this.nextSessionId++}`,
      roomId: message.roomId,
      peerId: message.peerId,
      ...(message.protocol ? { protocol: message.protocol } : {}),
      queue: [],
      pendingResolvers: [],
    };
    const room = this.rooms.get(message.roomId) ?? new Map<string, SessionState>();
    const peers = Array.from(room.values()).map((peer) => {
      return peer.protocol
        ? {
            peerId: peer.peerId,
            protocol: peer.protocol,
          }
        : {
            peerId: peer.peerId,
          };
    });
    room.set(message.peerId, session);
    this.rooms.set(message.roomId, room);
    this.sessions.set(session.sessionId, session);

    for (const existingSession of room.values()) {
      if (existingSession.peerId === message.peerId) {
        continue;
      }

      this.enqueueMessage(
        existingSession,
        JSON.stringify({
          type: 'peer-joined',
          roomId: message.roomId,
          peerId: message.peerId,
          ...(message.protocol ? { protocol: message.protocol } : {}),
        }),
      );
    }

    expect(headers.accept).toBe('application/json');

    return new MockResponse(
      200,
      JSON.stringify({
        type: 'joined',
        sessionId: session.sessionId,
        roomId: message.roomId,
        peerId: message.peerId,
        peers,
      }),
      {
        'content-type': 'application/json; charset=utf-8',
      },
    );
  }

  private async handleEvents(sessionId: string): Promise<MockResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return new MockResponse(404, JSON.stringify({ code: 'NOT_JOINED', message: 'Missing session.' }), {
        'content-type': 'application/json; charset=utf-8',
      });
    }

    const payload = session.queue.shift();
    if (payload) {
      return this.toEventResponse(payload);
    }

    return new Promise<MockResponse>((resolve) => {
      session.pendingResolvers.push(resolve);
    });
  }

  private async handleTransportMessage(
    sessionId: string,
    body: string | Uint8Array | undefined,
  ): Promise<MockResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return new MockResponse(404, JSON.stringify({ code: 'NOT_JOINED', message: 'Missing session.' }), {
        'content-type': 'application/json; charset=utf-8',
      });
    }

    const message = parseWebSocketRelayClientMessage(body ?? '');
    if (!message || message.type !== 'transport') {
      return new MockResponse(400, JSON.stringify({ code: 'INVALID_MESSAGE', message: 'Invalid frame.' }), {
        'content-type': 'application/json; charset=utf-8',
      });
    }

    const room = this.rooms.get(session.roomId);
    if (!room) {
      return new MockResponse(202);
    }

    if (message.signal.toPeerId) {
      const target = room.get(message.signal.toPeerId);
      if (target) {
        this.enqueueTransportMessage(target, message);
      }

      return new MockResponse(202);
    }

    for (const peerSession of room.values()) {
      if (peerSession.peerId === session.peerId) {
        continue;
      }

      this.enqueueTransportMessage(peerSession, message);
    }

    return new MockResponse(202);
  }

  private async handleDelete(sessionId: string): Promise<MockResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return new MockResponse(204);
    }

    this.sessions.delete(sessionId);
    const room = this.rooms.get(session.roomId);
    if (room) {
      room.delete(session.peerId);
      for (const peerSession of room.values()) {
        this.enqueueMessage(
          peerSession,
          JSON.stringify({
            type: 'peer-left',
            roomId: session.roomId,
            peerId: session.peerId,
          }),
        );
      }

      if (room.size === 0) {
        this.rooms.delete(session.roomId);
      }
    }

    return new MockResponse(204);
  }

  private enqueueTransportMessage(
    session: SessionState,
    message: Extract<NonNullable<ReturnType<typeof parseWebSocketRelayClientMessage>>, { type: 'transport' }>,
  ): void {
    this.enqueueMessage(
      session,
      serializeWebSocketRelayMessage({
        type: 'transport',
        signal: message.signal,
        session: session.protocol?.codecs.includes('msgpack')
          ? {
              version: 2,
              codec: 'msgpack',
              legacy: false,
            }
          : getBootstrapProtocolSession(),
      }),
    );
  }

  private enqueueMessage(session: SessionState, payload: string | Uint8Array): void {
    const pendingResolver = session.pendingResolvers.shift();
    if (pendingResolver) {
      pendingResolver(this.toEventResponse(payload));
      return;
    }

    session.queue.push(payload);
  }

  private toEventResponse(payload: string | Uint8Array): MockResponse {
    return payload instanceof Uint8Array
      ? new MockResponse(200, payload, {
          'content-type': 'application/msgpack',
        })
      : new MockResponse(200, payload, {
          'content-type': 'application/json; charset=utf-8',
        });
  }
}

async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for condition after ${timeoutMs}ms.`);
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }
}

describe('PollingTransportAdapter', () => {
  const protocol = getTransportProtocolCapabilities('polling');

  it('connects successfully and delivers broadcast transport messages to peers', async () => {
    const relay = new MockPollingRelay();
    const adapterA = createPollingTransportAdapter(
      'room-polling',
      'peer-a',
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local',
        websocket: {
          fallbackTransport: 'polling',
        },
      },
      relay.fetch,
    );
    const adapterB = createPollingTransportAdapter(
      'room-polling',
      'peer-b',
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local',
        websocket: {
          fallbackTransport: 'polling',
        },
      },
      relay.fetch,
    );

    const receivedByA: string[] = [];
    adapterA.onMessage((signal) => {
      receivedByA.push(`${signal.type}:${signal.fromPeerId}`);
    });

    await adapterA.connect();
    await adapterB.connect();

    adapterB.broadcast({
      type: 'hello',
      roomId: 'room-polling',
      fromPeerId: 'peer-b',
      timestamp: 1,
      payload: {
        peer: {
          id: 'peer-b',
          joinedAt: 1,
          lastSeen: 1,
        },
        protocol,
      },
    });

    await waitFor(() => receivedByA.includes('hello:peer-b'));

    await adapterA.disconnect();
    await adapterB.disconnect();
  });

  it('sends bearer auth on polling join and message requests', async () => {
    const relay = new MockPollingRelay();
    const adapter = createPollingTransportAdapter(
      'room-auth',
      'peer-a',
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local/base?lang=en',
        relayAuth: async () => 'token-123',
        websocket: {
          fallbackTransport: 'polling',
        },
      },
      relay.fetch,
    );

    await adapter.connect();
    adapter.broadcast({
      type: 'hello',
      roomId: 'room-auth',
      fromPeerId: 'peer-a',
      timestamp: 1,
      payload: {
        peer: {
          id: 'peer-a',
          joinedAt: 1,
          lastSeen: 1,
        },
        protocol,
      },
    });

    await waitFor(() => relay.requests.some((request) => request.url.includes('/messages')));

    const joinRequest = relay.requests.find((request) => request.method === 'POST' && request.url.includes('/poll/sessions') && !request.url.includes('/messages'));
    const messageRequest = relay.requests.find((request) => request.method === 'POST' && request.url.includes('/messages'));

    expect(joinRequest?.headers.authorization).toBe('Bearer token-123');
    expect(messageRequest?.headers.authorization).toBe('Bearer token-123');
    expect(joinRequest?.url).toContain('/base/poll/sessions?lang=en');

    await adapter.disconnect();
  });

  it('maps relay join rejections to typed Flock errors', async () => {
    const fullRelay = new MockPollingRelay({
      rejectJoinCode: 'ROOM_FULL',
      rejectJoinMessage: 'Room is full.',
    });
    const fullAdapter = createPollingTransportAdapter(
      'room-full',
      'peer-a',
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local',
        websocket: {
          fallbackTransport: 'polling',
        },
      },
      fullRelay.fetch,
    );

    await expect(fullAdapter.connect()).rejects.toMatchObject({
      code: 'ROOM_FULL',
      recoverable: true,
      message: 'Room is full.',
    });

    const authRelay = new MockPollingRelay({
      rejectJoinCode: 'AUTH_FAILED',
      rejectJoinMessage: 'Authorization failed.',
    });
    const authAdapter = createPollingTransportAdapter(
      'room-auth',
      'peer-a',
      {
        transport: 'websocket',
        relayUrl: 'ws://relay.local',
        websocket: {
          fallbackTransport: 'polling',
        },
      },
      authRelay.fetch,
    );

    await expect(authAdapter.connect()).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      message: 'Authorization failed.',
    });
  });
});
