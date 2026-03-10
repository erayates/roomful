import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createRelayServer, type RelayServer } from './index.js';
import { isObject } from './internal/guards.js';
import { isRelayJoinProtocol } from './relay-protocol-guards.js';
import type {
  RelayRedisEnvelope,
  RelayRedisJoinRequest,
  RelayRedisJoinResult,
  RelayRedisStore,
  RelayRedisStoreOptions,
  RelayRedisSyncRequest,
} from './relay-redis-store.js';
import type { RelayServerInternalOptions } from './server.js';

interface JsonMessage {
  type: string;
  [key: string]: unknown;
}

interface FakeRoomState {
  peers: Map<string, string>;
  capacity?: number;
}

function parseProtocolEntry(value: string): RelayRedisJoinRequest['protocol'] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (!isObject(parsed)) {
    return undefined;
  }

  const protocol = parsed['protocol'];
  return isRelayJoinProtocol(protocol) ? protocol : undefined;
}

function parseInstanceId(value: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (!isObject(parsed)) {
    return undefined;
  }

  const instanceId = parsed['instanceId'];
  if (typeof instanceId !== 'string') {
    return undefined;
  }

  return instanceId;
}

function createRedisTestServer(
  createRedisStore: (options: RelayRedisStoreOptions) => RelayRedisStore,
): RelayServer {
  const options: RelayServerInternalOptions = {
    port: 0,
    redisUrl: 'redis://relay.local:6379',
    createRedisStore,
  };
  return createRelayServer(options);
}

function createRedisUnavailableError(): TypeError {
  const error = new TypeError('Redis unavailable.');
  error.name = 'FakeRedisUnavailableError';
  return error;
}

function parseJsonUnknown(value: string): unknown {
  return JSON.parse(value);
}

class FakeRedisHub {
  private ready = true;

  private readonly rooms = new Map<string, FakeRoomState>();

  private readonly channelSubscriptions = new Map<string, Set<FakeRedisStoreImpl>>();

  private readonly stores = new Set<FakeRedisStoreImpl>();

  public createStore(options: RelayRedisStoreOptions): RelayRedisStore {
    const store = new FakeRedisStoreImpl(this, options);
    this.stores.add(store);
    return store;
  }

  public removeStore(store: FakeRedisStoreImpl): void {
    this.stores.delete(store);
    for (const subscribers of this.channelSubscriptions.values()) {
      subscribers.delete(store);
    }
  }

  public isReady(): boolean {
    return this.ready;
  }

  public setReady(ready: boolean): void {
    this.ready = ready;
    for (const store of this.stores) {
      store.handleReadyStateChange(ready);
    }
  }

  public subscribe(channel: string, store: FakeRedisStoreImpl): void {
    const subscribers = this.channelSubscriptions.get(channel) ?? new Set<FakeRedisStoreImpl>();
    subscribers.add(store);
    this.channelSubscriptions.set(channel, subscribers);
  }

  public unsubscribe(channel: string, store: FakeRedisStoreImpl): void {
    const subscribers = this.channelSubscriptions.get(channel);
    if (!subscribers) {
      return;
    }

    subscribers.delete(store);
    if (subscribers.size === 0) {
      this.channelSubscriptions.delete(channel);
    }
  }

  public publish(channel: string, message: RelayRedisEnvelope): void {
    const subscribers = this.channelSubscriptions.get(channel);
    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber.deliver(channel, message);
    }
  }

  public joinRoom(request: RelayRedisJoinRequest): RelayRedisJoinResult {
    const room = this.rooms.get(request.roomId) ?? {
      peers: new Map<string, string>(),
    };

    if (room.peers.has(request.peerId)) {
      return {
        ok: false,
        code: 'PEER_EXISTS',
        message: 'PeerId already exists in this room.',
      };
    }

    if (room.peers.size === 0 && request.maxPeers !== undefined) {
      room.capacity = request.maxPeers;
    }

    if (room.capacity !== undefined && room.peers.size >= room.capacity) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        message: 'Room is full.',
      };
    }

    const peers = Array.from(room.peers.entries()).map(([peerId, value]) => {
      const protocol = parseProtocolEntry(value);
      return protocol ? { peerId, protocol } : { peerId };
    });

    room.peers.set(
      request.peerId,
      JSON.stringify({
        instanceId: request.instanceId,
        ...(request.protocol ? { protocol: request.protocol } : {}),
      }),
    );
    this.rooms.set(request.roomId, room);

    return {
      ok: true,
      peers,
    };
  }

  public leaveRoom(roomId: string, peerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.peers.delete(peerId);
    if (room.peers.size === 0) {
      this.rooms.delete(roomId);
      return;
    }

    this.rooms.set(roomId, room);
  }

  public syncRoom(request: RelayRedisSyncRequest): void {
    const room = this.rooms.get(request.roomId) ?? {
      peers: new Map<string, string>(),
      ...(request.capacity !== undefined ? { capacity: request.capacity } : {}),
    };

    for (const [peerId, rawValue] of room.peers.entries()) {
      if (parseInstanceId(rawValue) !== request.instanceId) {
        continue;
      }

      room.peers.delete(peerId);
    }

    for (const peer of request.peers) {
      room.peers.set(
        peer.peerId,
        JSON.stringify({
          instanceId: request.instanceId,
          ...(peer.protocol ? { protocol: peer.protocol } : {}),
        }),
      );
    }

    if (room.peers.size === 0) {
      this.rooms.delete(request.roomId);
      return;
    }

    this.rooms.set(request.roomId, room);
  }
}

class FakeRedisStoreImpl implements RelayRedisStore {
  private readonly channels = new Set<string>();

  private readonly readyStateHandlers = new Set<(ready: boolean) => void>();

  public constructor(
    private readonly hub: FakeRedisHub,
    private readonly options: RelayRedisStoreOptions,
  ) {}

  public async start(): Promise<void> {
    return undefined;
  }

  public async stop(): Promise<void> {
    for (const channel of this.channels) {
      this.hub.unsubscribe(channel, this);
    }

    this.channels.clear();
    this.hub.removeStore(this);
  }

  public isReady(): boolean {
    return this.hub.isReady();
  }

  public onReadyStateChange(handler: (ready: boolean) => void): () => void {
    this.readyStateHandlers.add(handler);
    return (): void => {
      this.readyStateHandlers.delete(handler);
    };
  }

  public async subscribe(channel: string): Promise<void> {
    if (!this.isReady()) {
      throw createRedisUnavailableError();
    }

    this.channels.add(channel);
    this.hub.subscribe(channel, this);
  }

  public async unsubscribe(channel: string): Promise<void> {
    this.channels.delete(channel);
    this.hub.unsubscribe(channel, this);
  }

  public async publish(channel: string, message: RelayRedisEnvelope): Promise<void> {
    if (!this.isReady()) {
      throw createRedisUnavailableError();
    }

    this.hub.publish(channel, message);
  }

  public async joinRoom(request: RelayRedisJoinRequest): Promise<RelayRedisJoinResult> {
    if (!this.isReady()) {
      return {
        ok: false,
        code: 'REDIS_UNAVAILABLE',
        message: 'Redis coordination is unavailable.',
      };
    }

    return this.hub.joinRoom(request);
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    this.hub.leaveRoom(roomId, peerId);
  }

  public async syncRoom(request: RelayRedisSyncRequest): Promise<void> {
    this.hub.syncRoom(request);
  }

  public deliver(channel: string, message: RelayRedisEnvelope): void {
    if (!this.channels.has(channel) || !this.isReady()) {
      return;
    }

    this.options.onMessage(channel, message);
  }

  public handleReadyStateChange(ready: boolean): void {
    for (const handler of this.readyStateHandlers) {
      handler(ready);
    }
  }
}

function createRedisStoreFactory(hub: FakeRedisHub) {
  return (options: RelayRedisStoreOptions): RelayRedisStore => {
    return hub.createStore(options);
  };
}

function toUtf8(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }

  return Buffer.from(String(data), 'utf8').toString('utf8');
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = (): void => {
      socket.off('error', onError);
      resolve();
    };

    const onError = (error: Error): void => {
      socket.off('open', onOpen);
      reject(error);
    };

    socket.once('open', onOpen);
    socket.once('error', onError);
  });
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: JsonMessage) => boolean,
  timeoutMs = 2_000,
): Promise<JsonMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for message after ${timeoutMs}ms.`));
    }, timeoutMs);

    const onMessage = (data: unknown): void => {
      const parsed = parseJsonUnknown(toUtf8(data));
      if (!isObject(parsed) || typeof parsed['type'] !== 'string') {
        return;
      }

      const jsonMessage: JsonMessage = {
        ...parsed,
        type: parsed['type'],
      };

      if (!predicate(jsonMessage)) {
        return;
      }

      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(jsonMessage);
    };

    socket.on('message', onMessage);
  });
}

function send(socket: WebSocket, payload: JsonMessage): void {
  socket.send(JSON.stringify(payload));
}

function sendAndWaitForMessage(
  socket: WebSocket,
  payload: JsonMessage,
  predicate: (message: JsonMessage) => boolean,
  timeoutMs?: number,
): Promise<JsonMessage> {
  const pendingMessage = waitForMessage(socket, predicate, timeoutMs);
  send(socket, payload);
  return pendingMessage;
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      socket.off('close', onClose);
      socket.terminate();
      resolve();
    }, 1_000);

    const onClose = (): void => {
      clearTimeout(timer);
      resolve();
    };

    socket.once('close', onClose);
    socket.close();
  });
}

export function registerRedisIntegrationTests(): void {
  describe('relay redis coordination', () => {
    const servers: RelayServer[] = [];
    const sockets: WebSocket[] = [];

    afterEach(async () => {
      await Promise.all(
        sockets.splice(0).map((socket) => {
          return closeSocket(socket);
        }),
      );

      await Promise.all(
        servers.splice(0).map((server) => {
          return server.stop();
        }),
      );
    });

    it('propagates peer join and leave events across relay instances', async () => {
      const hub = new FakeRedisHub();
      const createRedisStore = createRedisStoreFactory(hub);
      const serverA = createRedisTestServer(createRedisStore);
      const serverB = createRedisTestServer(createRedisStore);
      servers.push(serverA, serverB);

      await Promise.all([serverA.start(), serverB.start()]);

      const clientA = new WebSocket(serverA.getAddress());
      const clientB = new WebSocket(serverB.getAddress());
      sockets.push(clientA, clientB);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);

      await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-redis',
          peerId: 'peer-a',
        },
        (message) => message.type === 'joined',
      );

      const peerJoinedAtA = waitForMessage(
        clientA,
        (message) => message.type === 'peer-joined' && message.peerId === 'peer-b',
      );
      const joinedB = await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-redis',
          peerId: 'peer-b',
        },
        (message) => message.type === 'joined',
      );

      expect(joinedB).toMatchObject({
        type: 'joined',
        roomId: 'room-redis',
        peerId: 'peer-b',
        peers: [{ peerId: 'peer-a' }],
      });
      await expect(peerJoinedAtA).resolves.toMatchObject({
        type: 'peer-joined',
        roomId: 'room-redis',
        peerId: 'peer-b',
      });

      const peerLeftAtA = waitForMessage(
        clientA,
        (message) => message.type === 'peer-left' && message.peerId === 'peer-b',
      );
      send(clientB, {
        type: 'leave',
        roomId: 'room-redis',
        peerId: 'peer-b',
      });

      await expect(peerLeftAtA).resolves.toMatchObject({
        type: 'peer-left',
        roomId: 'room-redis',
        peerId: 'peer-b',
      });
    });

    it('routes signal and transport frames across relay instances', async () => {
      const hub = new FakeRedisHub();
      const createRedisStore = createRedisStoreFactory(hub);
      const serverA = createRedisTestServer(createRedisStore);
      const serverB = createRedisTestServer(createRedisStore);
      servers.push(serverA, serverB);

      await Promise.all([serverA.start(), serverB.start()]);

      const clientA = new WebSocket(serverA.getAddress());
      const clientB = new WebSocket(serverB.getAddress());
      sockets.push(clientA, clientB);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);

      await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-redis-routing',
          peerId: 'peer-a',
        },
        (message) => message.type === 'joined',
      );
      await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-redis-routing',
          peerId: 'peer-b',
        },
        (message) => message.type === 'joined',
      );

      send(clientA, {
        type: 'signal',
        roomId: 'room-redis-routing',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        description: {
          type: 'offer',
          sdp: 'remote-offer',
        },
      });

      await expect(
        waitForMessage(
          clientB,
          (message) =>
            message.type === 'signal' &&
            message.roomId === 'room-redis-routing' &&
            message.fromPeerId === 'peer-a' &&
            message.toPeerId === 'peer-b',
        ),
      ).resolves.toMatchObject({
        type: 'signal',
        roomId: 'room-redis-routing',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
      });

      send(clientA, {
        type: 'transport',
        message: {
          source: 'flockjs',
          protocolVersion: 2,
          codec: 'json',
          roomId: 'room-redis-routing',
          fromPeerId: 'peer-a',
          timestamp: 1,
          type: 'event',
          payload: {
            name: 'remote-event',
            payload: {
              ok: true,
            },
          },
        },
      });

      await expect(
        waitForMessage(
          clientB,
          (message) =>
            message.type === 'transport' &&
            isObject(message.message) &&
            isObject(message.message['signal']) &&
            message.message['signal']['type'] === 'event',
        ),
      ).resolves.toMatchObject({
        type: 'transport',
        message: {
          source: 'flockjs',
          version: 1,
          signal: {
            type: 'event',
            roomId: 'room-redis-routing',
            fromPeerId: 'peer-a',
          },
        },
      });
    });

    it('blocks new joins during redis outages while same-instance traffic continues and resumes after recovery', async () => {
      const hub = new FakeRedisHub();
      const createRedisStore = createRedisStoreFactory(hub);
      const server = createRedisTestServer(createRedisStore);
      servers.push(server);

      await server.start();

      const clientA = new WebSocket(server.getAddress());
      const clientB = new WebSocket(server.getAddress());
      sockets.push(clientA, clientB);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);

      await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-recovery',
          peerId: 'peer-a',
        },
        (message) => message.type === 'joined',
      );
      await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-recovery',
          peerId: 'peer-b',
        },
        (message) => message.type === 'joined',
      );

      hub.setReady(false);

      const clientC = new WebSocket(server.getAddress());
      sockets.push(clientC);
      await waitForOpen(clientC);

      await expect(
        sendAndWaitForMessage(
          clientC,
          {
            type: 'join',
            roomId: 'room-recovery',
            peerId: 'peer-c',
          },
          (message) => message.type === 'error',
        ),
      ).resolves.toMatchObject({
        type: 'error',
        code: 'REDIS_UNAVAILABLE',
        message: 'Redis coordination is unavailable.',
      });

      send(clientA, {
        type: 'signal',
        roomId: 'room-recovery',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        description: {
          type: 'offer',
          sdp: 'still-local',
        },
      });

      await expect(
        waitForMessage(
          clientB,
          (message) =>
            message.type === 'signal' &&
            message.roomId === 'room-recovery' &&
            message.fromPeerId === 'peer-a' &&
            message.toPeerId === 'peer-b',
        ),
      ).resolves.toMatchObject({
        type: 'signal',
        roomId: 'room-recovery',
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
      });

      hub.setReady(true);

      await expect(
        sendAndWaitForMessage(
          clientC,
          {
            type: 'join',
            roomId: 'room-recovery',
            peerId: 'peer-c',
          },
          (message) => message.type === 'joined',
        ),
      ).resolves.toMatchObject({
        type: 'joined',
        roomId: 'room-recovery',
        peerId: 'peer-c',
        peers: [{ peerId: 'peer-a' }, { peerId: 'peer-b' }],
      });
    });

    it('replays peer-left events after redis recovers when the last local peer leaves during an outage', async () => {
      const hub = new FakeRedisHub();
      const createRedisStore = createRedisStoreFactory(hub);
      const serverA = createRedisTestServer(createRedisStore);
      const serverB = createRedisTestServer(createRedisStore);
      servers.push(serverA, serverB);

      await Promise.all([serverA.start(), serverB.start()]);

      const clientA = new WebSocket(serverA.getAddress());
      const clientB = new WebSocket(serverB.getAddress());
      sockets.push(clientA, clientB);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);

      await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-reconnect-leave',
          peerId: 'peer-a',
        },
        (message) => message.type === 'joined',
      );
      await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-reconnect-leave',
          peerId: 'peer-b',
        },
        (message) => message.type === 'joined',
      );

      hub.setReady(false);

      const pendingPeerLeft = waitForMessage(
        clientB,
        (message) => message.type === 'peer-left' && message.peerId === 'peer-a',
      );
      await closeSocket(clientA);

      hub.setReady(true);

      await expect(pendingPeerLeft).resolves.toMatchObject({
        type: 'peer-left',
        roomId: 'room-reconnect-leave',
        peerId: 'peer-a',
      });
    });
  });
}
