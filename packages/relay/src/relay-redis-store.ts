import { randomUUID } from 'node:crypto';

import Redis from 'ioredis';

import { isObject, isUnknownArray } from './internal/guards';
import type {
  RelayCoordinatorMessage,
  RelayJoinPeer,
  RelayJoinProtocol,
  RelayJoinResult,
} from './relay-coordinator';
import { isRelayJoinProtocol } from './relay-protocol-guards';

const REDIS_NAMESPACE = 'flock:relay:v1';

const JOIN_ROOM_SCRIPT = `
local peersKey = KEYS[1]
local capacityKey = KEYS[2]
local peerId = ARGV[1]
local peerValue = ARGV[2]
local maxPeers = ARGV[3]

if redis.call('HEXISTS', peersKey, peerId) == 1 then
  return { 'reject', 'PEER_EXISTS', 'PeerId already exists in this room.' }
end

local currentSize = redis.call('HLEN', peersKey)
local capacity = redis.call('GET', capacityKey)

if currentSize == 0 and (not capacity) and maxPeers ~= '' then
  redis.call('SET', capacityKey, maxPeers)
  capacity = maxPeers
end

if capacity and tonumber(currentSize) >= tonumber(capacity) then
  return { 'reject', 'ROOM_FULL', 'Room is full.' }
end

local existing = redis.call('HGETALL', peersKey)
redis.call('HSET', peersKey, peerId, peerValue)

return { 'ok', unpack(existing) }
`;

const LEAVE_ROOM_SCRIPT = `
local peersKey = KEYS[1]
local capacityKey = KEYS[2]
local peerId = ARGV[1]

redis.call('HDEL', peersKey, peerId)

if redis.call('HLEN', peersKey) == 0 then
  redis.call('DEL', peersKey)
  redis.call('DEL', capacityKey)
end

return 'OK'
`;

export interface RelayRedisEnvelope {
  id: string;
  sourceInstanceId: string;
  roomId: string;
  message: RelayCoordinatorMessage;
}

export interface RelayRedisJoinRequest {
  roomId: string;
  peerId: string;
  instanceId: string;
  protocol?: RelayJoinProtocol;
  maxPeers?: number;
}

export type RelayRedisJoinResult = RelayJoinResult;

export interface RelayRedisSyncRequest {
  roomId: string;
  instanceId: string;
  peers: RelayJoinPeer[];
  capacity?: number;
}

export interface RelayRedisStoreOptions {
  redisUrl: string;
  instanceId: string;
  onMessage(channel: string, message: RelayRedisEnvelope): void;
}

export interface RelayRedisStore {
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
  onReadyStateChange(handler: (ready: boolean) => void): () => void;
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  publish(channel: string, message: RelayRedisEnvelope): Promise<void>;
  joinRoom(request: RelayRedisJoinRequest): Promise<RelayRedisJoinResult>;
  leaveRoom(roomId: string, peerId: string): Promise<void>;
  syncRoom(request: RelayRedisSyncRequest): Promise<void>;
}

interface StoredPeerEntry {
  instanceId: string;
  protocol?: RelayJoinProtocol;
}

function roomPeersKey(roomId: string): string {
  return `${REDIS_NAMESPACE}:room:${roomId}:peers`;
}

function roomCapacityKey(roomId: string): string {
  return `${REDIS_NAMESPACE}:room:${roomId}:capacity`;
}

export function roomRedisChannel(roomId: string): string {
  return `${REDIS_NAMESPACE}:room:${roomId}`;
}

function serializeStoredPeerEntry(entry: StoredPeerEntry): string {
  return JSON.stringify(entry);
}

function parseStoredPeerEntry(value: string): StoredPeerEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isObject(parsed)) {
    return null;
  }

  const instanceId = parsed['instanceId'];
  if (typeof instanceId !== 'string' || instanceId.length === 0) {
    return null;
  }

  const protocol = parsed['protocol'];
  return protocol === undefined
    ? {
        instanceId,
      }
    : isRelayJoinProtocol(protocol)
      ? {
          instanceId,
          protocol,
        }
      : {
          instanceId,
        };
}

function parseRedisUrl(redisUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw createRelayRedisConfigurationError(`Invalid redisUrl value "${redisUrl}".`);
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw createRelayRedisConfigurationError(`Invalid redisUrl value "${redisUrl}".`);
  }

  return parsed.toString();
}

function createRelayRedisConfigurationError(message: string): TypeError {
  const error = new TypeError(message);
  error.name = 'RelayRedisConfigurationError';
  return error;
}

function readRedisErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRelayRedisEnvelope(value: unknown): value is RelayRedisEnvelope {
  if (!isObject(value)) {
    return false;
  }

  const id = value['id'];
  const sourceInstanceId = value['sourceInstanceId'];
  const roomId = value['roomId'];
  const message = value['message'];
  return (
    typeof id === 'string' &&
    typeof sourceInstanceId === 'string' &&
    typeof roomId === 'string' &&
    isObject(message) &&
    typeof message['type'] === 'string'
  );
}

function normalizeRelayRedisMessage(message: RelayCoordinatorMessage): RelayCoordinatorMessage {
  if (message.type !== 'transport') {
    return message;
  }

  const normalizedMessage: Extract<RelayCoordinatorMessage, { type: 'transport' }> = {
    type: 'transport',
    signal: message.signal,
    encoding: 'json',
  };
  return normalizedMessage;
}

export class RelayRedisStoreImpl implements RelayRedisStore {
  private readonly commandClient: Redis;

  private readonly subscriber: Redis;

  private readonly subscribedChannels = new Set<string>();

  private readonly readyStateHandlers = new Set<(ready: boolean) => void>();

  private ready = false;

  private started = false;

  public constructor(private readonly options: RelayRedisStoreOptions) {
    const redisUrl = parseRedisUrl(options.redisUrl);
    this.commandClient = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.subscriber = this.commandClient.duplicate({
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      autoResubscribe: true,
    });

    this.subscriber.on('message', (channel, message) => {
      this.handleSubscriberMessage(channel, message);
    });

    for (const client of [this.commandClient, this.subscriber]) {
      client.on('ready', () => {
        this.updateReadyState();
      });
      client.on('close', () => {
        this.updateReadyState();
      });
      client.on('end', () => {
        this.updateReadyState();
      });
      client.on('reconnecting', () => {
        this.updateReadyState();
      });
      client.on('error', () => {
        this.updateReadyState();
      });
    }
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await Promise.all([this.commandClient.connect(), this.subscriber.connect()]);
    this.started = true;
    this.updateReadyState();
  }

  public async stop(): Promise<void> {
    this.started = false;
    this.subscribedChannels.clear();
    this.ready = false;
    this.commandClient.disconnect(false);
    this.subscriber.disconnect(false);
  }

  public isReady(): boolean {
    return this.ready;
  }

  public onReadyStateChange(handler: (ready: boolean) => void): () => void {
    this.readyStateHandlers.add(handler);
    return (): void => {
      this.readyStateHandlers.delete(handler);
    };
  }

  public async subscribe(channel: string): Promise<void> {
    if (this.subscribedChannels.has(channel)) {
      return;
    }

    await this.subscriber.subscribe(channel);
    this.subscribedChannels.add(channel);
  }

  public async unsubscribe(channel: string): Promise<void> {
    if (!this.subscribedChannels.has(channel)) {
      return;
    }

    await this.subscriber.unsubscribe(channel);
    this.subscribedChannels.delete(channel);
  }

  public async publish(channel: string, message: RelayRedisEnvelope): Promise<void> {
    await this.commandClient.publish(channel, JSON.stringify(message));
  }

  public async joinRoom(request: RelayRedisJoinRequest): Promise<RelayRedisJoinResult> {
    const rawResult: unknown = await this.commandClient.eval(
      JOIN_ROOM_SCRIPT,
      2,
      roomPeersKey(request.roomId),
      roomCapacityKey(request.roomId),
      request.peerId,
      serializeStoredPeerEntry({
        instanceId: request.instanceId,
        ...(request.protocol ? { protocol: request.protocol } : {}),
      }),
      request.maxPeers !== undefined ? String(request.maxPeers) : '',
    );

    if (!isUnknownArray(rawResult) || rawResult.length === 0) {
      return {
        ok: false,
        code: 'REDIS_UNAVAILABLE',
        message: 'Redis coordination is unavailable.',
      };
    }

    if (rawResult[0] === 'reject') {
      const code = typeof rawResult[1] === 'string' ? rawResult[1] : 'REDIS_UNAVAILABLE';
      const message =
        typeof rawResult[2] === 'string' ? rawResult[2] : 'Redis coordination is unavailable.';
      return {
        ok: false,
        code,
        message,
      };
    }

    const peers: RelayJoinPeer[] = [];
    for (let index = 1; index < rawResult.length; index += 2) {
      const peerId = rawResult[index];
      const value = rawResult[index + 1];
      if (typeof peerId !== 'string' || typeof value !== 'string') {
        continue;
      }

      const storedPeer = parseStoredPeerEntry(value);
      if (!storedPeer) {
        continue;
      }

      peers.push(
        storedPeer.protocol
          ? {
              peerId,
              protocol: storedPeer.protocol,
            }
          : {
              peerId,
            },
      );
    }

    return {
      ok: true,
      peers,
    };
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    await this.commandClient.eval(
      LEAVE_ROOM_SCRIPT,
      2,
      roomPeersKey(roomId),
      roomCapacityKey(roomId),
      peerId,
    );
  }

  public async syncRoom(request: RelayRedisSyncRequest): Promise<void> {
    const peersKey = roomPeersKey(request.roomId);
    const capacityKey = roomCapacityKey(request.roomId);
    const existing = await this.commandClient.hgetall(peersKey);
    const pipeline = this.commandClient.pipeline();
    const localPeerIds = new Set(request.peers.map((peer) => peer.peerId));

    for (const [peerId, rawValue] of Object.entries(existing)) {
      const storedPeer = parseStoredPeerEntry(rawValue);
      if (!storedPeer || storedPeer.instanceId !== request.instanceId || localPeerIds.has(peerId)) {
        continue;
      }

      pipeline.hdel(peersKey, peerId);
    }

    for (const peer of request.peers) {
      pipeline.hset(
        peersKey,
        peer.peerId,
        serializeStoredPeerEntry({
          instanceId: request.instanceId,
          ...(peer.protocol ? { protocol: peer.protocol } : {}),
        }),
      );
    }

    if (request.peers.length > 0 && request.capacity !== undefined) {
      const existingCapacity = await this.commandClient.get(capacityKey);
      if (existingCapacity === null) {
        pipeline.set(capacityKey, String(request.capacity));
      }
    }

    await pipeline.exec();
  }

  private handleSubscriberMessage(channel: string, payload: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    if (!isRelayRedisEnvelope(parsed)) {
      return;
    }

    this.options.onMessage(channel, parsed);
  }

  private updateReadyState(): void {
    const nextReady = this.commandClient.status === 'ready' && this.subscriber.status === 'ready';
    if (nextReady === this.ready) {
      return;
    }

    this.ready = nextReady;
    for (const handler of this.readyStateHandlers) {
      handler(nextReady);
    }
  }
}

export function createRelayRedisEnvelope(
  sourceInstanceId: string,
  roomId: string,
  message: RelayCoordinatorMessage,
): RelayRedisEnvelope {
  return {
    id: randomUUID(),
    sourceInstanceId,
    roomId,
    message: normalizeRelayRedisMessage(message),
  };
}

export function createRelayRedisStore(options: RelayRedisStoreOptions): RelayRedisStore {
  return new RelayRedisStoreImpl(options);
}

export function describeRelayRedisError(error: unknown): string {
  return readRedisErrorMessage(error);
}
