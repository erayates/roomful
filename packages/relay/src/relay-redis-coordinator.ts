import { randomUUID } from 'node:crypto';

import type {
  RelayCoordinatorMessage,
  RelayJoinPeer,
  RelayJoinRequest,
  RelayJoinResult,
  RelayRoomCoordinator,
} from './relay-coordinator';
import {
  createRelayRedisEnvelope,
  createRelayRedisStore,
  describeRelayRedisError,
  type RelayRedisStore,
  type RelayRedisStoreOptions,
  roomRedisChannel,
} from './relay-redis-store';

interface RedisRelayRoomState {
  peers: Map<string, RelayJoinPeer>;
  capacity?: number;
}

type RelayPendingPeerLeftMessage = Extract<RelayCoordinatorMessage, { type: 'peer-left' }>;

export interface RelayRedisCoordinatorOptions {
  redisUrl: string;
  createStore?: (options: RelayRedisStoreOptions) => RelayRedisStore;
  onError?: (message: string, error: unknown) => void;
}

export class RedisRelayRoomCoordinator implements RelayRoomCoordinator {
  public readonly mode = 'redis';

  private readonly instanceId = randomUUID();

  private readonly roomSubscriptions = new Map<string, number>();

  private readonly localRooms = new Map<string, RedisRelayRoomState>();

  private readonly pendingEmptyRoomSyncs = new Set<string>();

  private readonly pendingPeerLeftMessages: RelayPendingPeerLeftMessage[] = [];

  private messageHandler: ((message: RelayCoordinatorMessage) => void) | null = null;

  private readonly store: RelayRedisStore;

  private readyForJoins = false;

  private recoveryPromise: Promise<void> | null = null;

  public constructor(private readonly options: RelayRedisCoordinatorOptions) {
    const createStore = options.createStore ?? createRelayRedisStore;
    this.store = createStore({
      redisUrl: options.redisUrl,
      instanceId: this.instanceId,
      onMessage: (_channel, envelope) => {
        if (envelope.sourceInstanceId === this.instanceId || this.messageHandler === null) {
          return;
        }

        this.messageHandler(envelope.message);
      },
    });
    this.store.onReadyStateChange((ready) => {
      if (!ready) {
        this.readyForJoins = false;
        return;
      }

      void this.recoverFromReconnect().catch((error) => {
        this.reportError('Redis room resubscribe failed.', error);
      });
    });
  }

  public async start(): Promise<void> {
    await this.store.start();
    if (!this.store.isReady()) {
      this.readyForJoins = false;
      return;
    }

    await this.recoverFromReconnect();
  }

  public async stop(): Promise<void> {
    this.roomSubscriptions.clear();
    this.localRooms.clear();
    this.pendingEmptyRoomSyncs.clear();
    this.pendingPeerLeftMessages.length = 0;
    this.readyForJoins = false;
    this.recoveryPromise = null;
    await this.store.stop();
  }

  public isReady(): boolean {
    return this.store.isReady() && this.readyForJoins;
  }

  public async subscribe(roomId: string): Promise<void> {
    const count = this.roomSubscriptions.get(roomId) ?? 0;
    if (count > 0) {
      this.roomSubscriptions.set(roomId, count + 1);
      return;
    }

    await this.store.subscribe(roomRedisChannel(roomId));
    this.roomSubscriptions.set(roomId, 1);
  }

  public async unsubscribe(roomId: string): Promise<void> {
    const count = this.roomSubscriptions.get(roomId);
    if (count === undefined) {
      return;
    }

    if (count > 1) {
      this.roomSubscriptions.set(roomId, count - 1);
      return;
    }

    this.roomSubscriptions.delete(roomId);
    await this.store.unsubscribe(roomRedisChannel(roomId));
  }

  public async join(request: RelayJoinRequest): Promise<RelayJoinResult> {
    if (!this.isReady()) {
      return {
        ok: false,
        code: 'REDIS_UNAVAILABLE',
        message: 'Redis coordination is unavailable.',
      };
    }

    const result = await this.store.joinRoom({
      ...request,
      instanceId: this.instanceId,
    });
    if (!result.ok) {
      return result;
    }

    const room = this.localRooms.get(request.roomId) ?? {
      peers: new Map<string, RelayJoinPeer>(),
      ...(request.maxPeers !== undefined ? { capacity: request.maxPeers } : {}),
    };

    room.peers.set(request.peerId, {
      peerId: request.peerId,
      ...(request.protocol ? { protocol: request.protocol } : {}),
    });
    this.localRooms.set(request.roomId, room);

    return result;
  }

  public async leave(roomId: string, peerId: string): Promise<void> {
    const roomStillActive = this.removeLocalPeer(roomId, peerId);
    if (!this.isReady()) {
      if (!roomStillActive) {
        this.pendingEmptyRoomSyncs.add(roomId);
      }
      return;
    }

    this.pendingEmptyRoomSyncs.delete(roomId);
    await this.store.leaveRoom(roomId, peerId);
  }

  public async publish(message: RelayCoordinatorMessage): Promise<void> {
    if (!this.isReady()) {
      if (message.type === 'peer-left') {
        this.pendingPeerLeftMessages.push(message);
      }
      return;
    }

    const roomId = message.type === 'transport' ? message.signal.roomId : message.roomId;
    await this.store.publish(
      roomRedisChannel(roomId),
      createRelayRedisEnvelope(this.instanceId, roomId, message),
    );
  }

  public onMessage(handler: (message: RelayCoordinatorMessage) => void): () => void {
    this.messageHandler = handler;
    return (): void => {
      if (this.messageHandler === handler) {
        this.messageHandler = null;
      }
    };
  }

  private async recoverFromReconnect(): Promise<void> {
    if (this.recoveryPromise) {
      return this.recoveryPromise;
    }

    this.readyForJoins = false;
    this.recoveryPromise = (async () => {
      try {
        await this.resubscribeAndSync();
        this.readyForJoins = true;
      } finally {
        this.recoveryPromise = null;
      }
    })();
    return this.recoveryPromise;
  }

  private async resubscribeAndSync(): Promise<void> {
    for (const roomId of this.roomSubscriptions.keys()) {
      await this.store.subscribe(roomRedisChannel(roomId));
    }

    for (const [roomId, room] of this.localRooms.entries()) {
      await this.store.syncRoom({
        roomId,
        instanceId: this.instanceId,
        peers: Array.from(room.peers.values()),
        ...(room.capacity !== undefined ? { capacity: room.capacity } : {}),
      });
    }

    const pendingEmptyRooms = Array.from(this.pendingEmptyRoomSyncs);
    for (const roomId of pendingEmptyRooms) {
      await this.store.syncRoom({
        roomId,
        instanceId: this.instanceId,
        peers: [],
      });
    }

    const pendingPeerLeftMessages = [...this.pendingPeerLeftMessages];
    for (const message of pendingPeerLeftMessages) {
      await this.store.publish(
        roomRedisChannel(message.roomId),
        createRelayRedisEnvelope(this.instanceId, message.roomId, message),
      );
    }

    for (const roomId of pendingEmptyRooms) {
      this.pendingEmptyRoomSyncs.delete(roomId);
    }

    this.pendingPeerLeftMessages.splice(0, pendingPeerLeftMessages.length);
  }

  private removeLocalPeer(roomId: string, peerId: string): boolean {
    const room = this.localRooms.get(roomId);
    if (!room) {
      return false;
    }

    room.peers.delete(peerId);
    if (room.peers.size === 0) {
      this.localRooms.delete(roomId);
      return false;
    }

    this.localRooms.set(roomId, room);
    return true;
  }

  private reportError(message: string, error: unknown): void {
    if (this.options.onError) {
      this.options.onError(message, error);
      return;
    }

    process.stderr.write(`[relay] ${message} error=${describeRelayRedisError(error)}\n`);
  }
}

export function createRedisRelayRoomCoordinator(
  options: RelayRedisCoordinatorOptions,
): RelayRoomCoordinator {
  return new RedisRelayRoomCoordinator(options);
}
