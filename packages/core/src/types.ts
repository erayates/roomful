import type { Awareness as YjsAwareness } from 'y-protocols/awareness';
import type { Doc as YDoc } from 'yjs';

import type { FlockError, FlockErrorCode } from './flock-error';

export type PresenceData = Record<string, unknown>;

export type RoomStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type TransportMode = 'auto' | 'webrtc' | 'websocket' | 'broadcast';

export type RelayAuthToken = string | (() => string | Promise<string>);

export interface WebRTCDataChannelOptions {
  ordered?: boolean;
  maxRetransmits?: number;
  protocol?: string;
}

export interface WebRTCOptions {
  iceGatherTimeoutMs?: number;
  dataChannel?: WebRTCDataChannelOptions;
}

export interface WebSocketOptions {
  fallbackTransport?: 'polling';
}

export interface ReconnectOptions {
  maxAttempts?: number;
  backoffMs?: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
}

export interface EncryptionKeyOptions {
  key: CryptoKey;
}

export interface EncryptionPassphraseOptions {
  passphrase: string;
}

export type EncryptionOptions = EncryptionKeyOptions | EncryptionPassphraseOptions;

export interface DebugOptions {
  transport?: boolean;
  state?: boolean;
  presence?: boolean;
  events?: boolean;
  performance?: boolean;
}

export interface RoomOptions<TPresence extends PresenceData = PresenceData> {
  transport?: TransportMode;
  presence?: Partial<TPresence>;
  maxPeers?: number;
  stunUrls?: string[];
  relayUrl?: string;
  relayAuth?: RelayAuthToken;
  reconnect?: boolean | ReconnectOptions;
  webrtc?: WebRTCOptions;
  websocket?: WebSocketOptions;
  encryption?: EncryptionOptions;
  debug?: boolean | DebugOptions;
}

export type Peer<TPresence extends PresenceData = PresenceData> = {
  id: string;
  joinedAt: number;
  lastSeen: number;
  name?: string;
  color?: string;
  avatar?: string;
} & Partial<TPresence>;

export type { FlockError, FlockErrorCode };

export type Unsubscribe = () => void;

export type FlockYjsProviderStatus = 'connected' | 'disconnected';

export interface FlockYjsProviderEventMap {
  status: {
    status: FlockYjsProviderStatus;
  };
  sync: {
    synced: boolean;
  };
}

export type FlockYjsProviderEventName = keyof FlockYjsProviderEventMap;

export type FlockYjsProviderEventHandler<TEvent extends FlockYjsProviderEventName> = (
  payload: FlockYjsProviderEventMap[TEvent],
) => void;

export interface FlockYjsProvider {
  readonly doc: YDoc;
  readonly awareness: YjsAwareness;
  readonly synced: boolean;
  readonly status: FlockYjsProviderStatus;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  destroy(): Promise<void>;

  on<TEvent extends FlockYjsProviderEventName>(
    event: TEvent,
    cb: FlockYjsProviderEventHandler<TEvent>,
  ): Unsubscribe;
  off<TEvent extends FlockYjsProviderEventName>(
    event: TEvent,
    cb: FlockYjsProviderEventHandler<TEvent>,
  ): void;
}

export type RoomEventName =
  | 'connected'
  | 'offline'
  | 'online'
  | 'disconnected'
  | 'reconnecting'
  | 'error'
  | 'peer:join'
  | 'peer:leave'
  | 'peer:update'
  | 'room:full'
  | 'room:empty';

export interface RoomEventMap<TPresence extends PresenceData = PresenceData> {
  connected: void;
  offline: { reason?: string };
  online: void;
  disconnected: { reason?: string };
  reconnecting: { attempt: number };
  error: FlockError;
  'peer:join': Peer<TPresence>;
  'peer:leave': Peer<TPresence>;
  'peer:update': Peer<TPresence>;
  'room:full': void;
  'room:empty': void;
}

export type RoomEventHandler<TPresence extends PresenceData, TEvent extends RoomEventName> = (
  payload: RoomEventMap<TPresence>[TEvent],
) => void;

export interface CursorOptions {
  throttleMs?: number;
  smoothing?: boolean;
  idleAfterMs?: number;
}

export interface CursorRenderOptions {
  container?: string | HTMLElement;
  style?: 'default' | string;
  showName?: boolean;
  showIdle?: boolean;
  idleTimeout?: number;
  zIndex?: number;
}

export type CursorData = Record<string, unknown>;

export interface CursorBasePosition {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  xAbsolute: number;
  yAbsolute: number;
  element?: string;
  idle: boolean;
}

type CursorExtension<TCursor extends CursorData> = Omit<Partial<TCursor>, keyof CursorBasePosition>;

export type CursorPosition<TCursor extends CursorData = CursorData> = CursorBasePosition &
  CursorExtension<TCursor>;

export interface StateOptions<T> {
  initialValue: T;
  strategy?: 'lww' | 'crdt' | 'custom';
  persist?: boolean;
  merge?: (a: T, b: T) => T;
}

export interface StateChangeMeta {
  reason: 'set' | 'patch' | 'undo' | 'reset';
  changedBy: string;
  timestamp: number;
  pending: boolean;
  queuedMutationCount: number;
}

export interface EventOptions {
  loopback?: boolean;
  reliable?: boolean;
}

export interface AwarenessSelection {
  from: number;
  to: number;
  elementId: string;
}

export interface AwarenessState {
  peerId: string;
  typing?: boolean;
  focus?: string | null;
  selection?: AwarenessSelection | null;
  [key: string]: unknown;
}

export interface PresenceEngine<TPresence extends PresenceData = PresenceData> {
  update(this: void, data: Partial<TPresence>): void;
  replace(this: void, data: Partial<TPresence>): void;
  subscribe(cb: (peers: Peer<TPresence>[]) => void): Unsubscribe;
  get(peerId: string): Peer<TPresence> | null;
  getAll(): Peer<TPresence>[];
  getSelf(): Peer<TPresence>;
}

export interface CursorEngine<TCursor extends CursorData = CursorData> {
  mount(el: HTMLElement): void;
  unmount(): void;
  render(options?: CursorRenderOptions): void;
  subscribe(cb: (positions: CursorPosition<TCursor>[]) => void): Unsubscribe;
  getPositions(): CursorPosition<TCursor>[];
  setPosition(position: Partial<CursorPosition<TCursor>>): void;
}

export interface StateEngine<T> {
  get(): T;
  set(value: T): void;
  patch(partial: Partial<T>): void;
  subscribe(cb: (value: T, meta: StateChangeMeta) => void): Unsubscribe;
  undo(): void;
  reset(): void;
}

export interface AwarenessEngine {
  set(value: Record<string, unknown>): void;
  setTyping(isTyping: boolean): void;
  setFocus(elementId: string | null): void;
  setSelection(selection: AwarenessSelection | null): void;
  subscribe(cb: (peers: AwarenessState[]) => void): Unsubscribe;
  getAll(): AwarenessState[];
}

export interface EventEngine<TPresence extends PresenceData = PresenceData> {
  emit(name: string, payload: unknown): void;
  emitTo(peerId: string, name: string, payload: unknown): void;
  on(name: string, cb: (payload: unknown, from: Peer<TPresence>) => void): Unsubscribe;
  off(name: string, cb: (payload: unknown, from: Peer<TPresence>) => void): void;
}

export interface Room<TPresence extends PresenceData = PresenceData> {
  readonly id: string;
  readonly peerId: string;
  readonly status: RoomStatus;
  readonly peers: Peer<TPresence>[];
  readonly peerCount: number;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  usePresence(): PresenceEngine<TPresence>;
  useCursors<TCursor extends CursorData = CursorData>(options?: CursorOptions): CursorEngine<TCursor>;
  useState<T>(options: StateOptions<T>): StateEngine<T>;
  useAwareness(): AwarenessEngine;
  useEvents(options?: EventOptions): EventEngine<TPresence>;
  getYDoc(): YDoc;
  getYProvider(): FlockYjsProvider;

  on<TEvent extends RoomEventName>(
    event: TEvent,
    cb: RoomEventHandler<TPresence, TEvent>,
  ): Unsubscribe;
  off<TEvent extends RoomEventName>(event: TEvent, cb: RoomEventHandler<TPresence, TEvent>): void;
}
