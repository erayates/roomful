import { createFlockError } from '../flock-error';
import { env } from '../internal/env';
import { isObject, readString } from '../internal/guards';
import { normalizeMaxPeers } from '../internal/max-peers';
import type { PeerProtocolCapabilities, PeerProtocolSession } from '../protocol/peer-message';
import type { FlockError, PresenceData, RelayAuthToken, RoomOptions } from '../types';
import { resolveRelayHttpUrl } from './relay-url';
import {
  type RoomTransportSignal,
  toBroadcastSignal,
  type TransportAdapter,
  type TransportSignal,
} from './transport';
import {
  getBootstrapProtocolSession,
  getTransportProtocolCapabilities,
  isRoomTransportSignal,
  negotiateTransportProtocolSession,
} from './transport.protocol';
import {
  parseWebSocketRelayServerMessage,
  serializeWebSocketRelayMessage,
  type WebSocketRelayPeerDescriptor,
  type WebSocketRelayServerMessage,
} from './websocket.protocol';

const POLLING_EVENTS_PATH = 'poll/sessions';
const DEFAULT_POLL_TIMEOUT_MS = 25_000;

interface HeadersLike {
  get(name: string): string | null;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: HeadersLike;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FetchRequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}

export type FetchLike = (input: string, init?: FetchRequestInitLike) => Promise<FetchResponseLike>;

interface PollingJoinResponse {
  sessionId: string;
  roomId: string;
  peerId: string;
  peers: WebSocketRelayPeerDescriptor[];
}

function createPollingTransportError(message: string, cause?: unknown): FlockError {
  return createFlockError('NETWORK_ERROR', message, false, cause);
}

function createRelayMessageError(message: string, serverCode: string): FlockError {
  if (serverCode === 'ROOM_FULL') {
    return createFlockError('ROOM_FULL', message, true, {
      source: 'polling-relay',
      serverCode,
    });
  }

  return createFlockError(
    serverCode === 'AUTH_FAILED' ? 'AUTH_FAILED' : 'NETWORK_ERROR',
    message,
    false,
    {
      source: 'polling-relay',
      serverCode,
    },
  );
}

function resolveRelayUrl<TPresence extends PresenceData>(options: RoomOptions<TPresence>): string {
  const relayUrl = options.relayUrl;
  if (!relayUrl || relayUrl.trim().length === 0) {
    throw createPollingTransportError('Polling transport requires `relayUrl`.', {
      source: 'polling-relay',
      kind: 'missing-relay-url',
    });
  }

  return relayUrl;
}

function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (!env.hasFetch) {
    throw createPollingTransportError('Polling transport is not available in this runtime.', {
      source: 'polling-relay',
      kind: 'runtime-unavailable',
    });
  }

  return (input, init) => {
    return fetch(input, init as RequestInit) as Promise<FetchResponseLike>;
  };
}

async function resolveRelayAuthToken(
  relayAuth: RelayAuthToken | undefined,
): Promise<string | undefined> {
  if (relayAuth === undefined) {
    return undefined;
  }

  if (typeof relayAuth === 'string') {
    return relayAuth;
  }

  return relayAuth();
}

async function readResponsePayload(response: FetchResponseLike): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/msgpack')) {
    return new Uint8Array(await response.arrayBuffer());
  }

  return response.text();
}

async function readRelayResponseError(
  response: FetchResponseLike,
  fallbackMessage: string,
): Promise<FlockError> {
  const payload = await readResponsePayload(response);
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (isObject(parsed)) {
        const code = readString(parsed, 'code');
        const message = readString(parsed, 'message');
        if (code && message) {
          return createRelayMessageError(message, code);
        }
      }
    } catch {
      return createPollingTransportError(fallbackMessage, {
        source: 'polling-relay',
        status: response.status,
      });
    }
  }

  return createPollingTransportError(fallbackMessage, {
    source: 'polling-relay',
    status: response.status,
  });
}

function parsePollingJoinResponse(payload: string): PollingJoinResponse | null {
  const message = parseWebSocketRelayServerMessage(payload);
  if (!message || message.type !== 'joined') {
    return null;
  }

  try {
    const parsed = JSON.parse(payload);
    if (!isObject(parsed)) {
      return null;
    }

    const sessionId = readString(parsed, 'sessionId');
    if (!sessionId) {
      return null;
    }

    return {
      sessionId,
      roomId: message.roomId,
      peerId: message.peerId,
      peers: message.peers,
    };
  } catch {
    return null;
  }
}

function resolveEventResponseMessage(payload: unknown): WebSocketRelayServerMessage | null {
  return parseWebSocketRelayServerMessage(payload);
}

export class PollingTransportAdapter<
  TPresence extends PresenceData = PresenceData,
> implements TransportAdapter {
  public readonly kind = 'polling' as const;

  private readonly listeners = new Set<(signal: TransportSignal) => void>();

  private readonly relayUrl: string;

  private readonly fetchImpl: FetchLike;

  private readonly localProtocolCapabilities = getTransportProtocolCapabilities('polling');

  private readonly peerSessions = new Map<string, PeerProtocolSession>();

  private readonly peerCapabilities = new Map<string, PeerProtocolCapabilities | undefined>();

  private connected = false;

  private joinPromise: Promise<void> | null = null;

  private sessionId: string | null = null;

  private relayAuthToken: string | undefined;

  private pollController: AbortController | null = null;

  public constructor(
    private readonly roomId: string,
    private readonly peerId: string,
    private readonly options: RoomOptions<TPresence>,
    fetchImpl?: FetchLike,
  ) {
    this.relayUrl = resolveRelayUrl(options);
    this.fetchImpl = resolveFetch(fetchImpl);
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.joinPromise) {
      return this.joinPromise;
    }

    this.joinPromise = this.connectInternal();

    try {
      await this.joinPromise;
    } finally {
      this.joinPromise = null;
    }
  }

  public async disconnect(): Promise<void> {
    const sessionId = this.sessionId;
    this.connected = false;
    this.sessionId = null;
    this.relayAuthToken = undefined;
    this.peerSessions.clear();
    this.peerCapabilities.clear();
    this.pollController?.abort();
    this.pollController = null;

    if (!sessionId) {
      this.listeners.clear();
      return;
    }

    const url = this.resolveSessionUrl(sessionId);
    await this.fetchImpl(url, {
      method: 'DELETE',
      headers: this.createAuthHeaders(),
    }).catch(() => {
      return undefined;
    });

    this.listeners.clear();
  }

  public send(signal: TransportSignal): void {
    if (!isRoomTransportSignal(signal)) {
      return;
    }

    if (!signal.toPeerId) {
      this.broadcast(signal);
      return;
    }

    void this.sendSignal(signal);
  }

  public broadcast(signal: TransportSignal): void {
    if (!isRoomTransportSignal(signal)) {
      return;
    }

    void this.sendSignal(toBroadcastSignal(signal));
  }

  public onMessage(handler: (signal: TransportSignal) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private async connectInternal(): Promise<void> {
    this.relayAuthToken = await resolveRelayAuthToken(this.options.relayAuth);
    const maxPeers = normalizeMaxPeers(this.options.maxPeers);
    const response = await this.fetchImpl(resolveRelayHttpUrl(this.relayUrl, POLLING_EVENTS_PATH), {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json',
        ...this.createAuthHeaders(),
      },
      body: JSON.stringify({
        type: 'join',
        roomId: this.roomId,
        peerId: this.peerId,
        protocol: this.localProtocolCapabilities,
        ...(maxPeers !== undefined ? { maxPeers } : {}),
      }),
    });

    if (!response.ok) {
      throw await readRelayResponseError(response, 'Failed to establish polling relay session.');
    }

    const payload = await response.text();
    const joined = parsePollingJoinResponse(payload);
    if (!joined || joined.roomId !== this.roomId || joined.peerId !== this.peerId) {
      throw createPollingTransportError('Polling relay returned an invalid join response.', {
        source: 'polling-relay',
        kind: 'invalid-join-response',
      });
    }

    this.sessionId = joined.sessionId;
    this.initializePeerNegotiationState(joined.peers);
    this.connected = true;
    void this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    while (this.connected && this.sessionId) {
      const controller = new AbortController();
      this.pollController = controller;

      try {
        const response = await this.fetchImpl(
          `${this.resolveSessionUrl(this.sessionId)}/events?timeoutMs=${DEFAULT_POLL_TIMEOUT_MS}`,
          {
            method: 'GET',
            headers: {
              accept: 'application/msgpack, application/json',
              ...this.createAuthHeaders(),
            },
            signal: controller.signal,
          },
        );
        this.pollController = null;

        if (!this.connected) {
          return;
        }

        if (response.status === 204) {
          continue;
        }

        if (!response.ok) {
          throw await readRelayResponseError(response, 'Polling relay event request failed.');
        }

        const payload = await readResponsePayload(response);
        const message = resolveEventResponseMessage(payload);
        if (!message) {
          throw createPollingTransportError('Polling relay returned an invalid event frame.', {
            source: 'polling-relay',
            kind: 'invalid-event-response',
          });
        }

        this.handleServerMessage(message);
      } catch (error) {
        this.pollController = null;
        if (controller.signal.aborted || !this.connected) {
          return;
        }

        const flockError =
          error instanceof Error && error.name === 'AbortError'
            ? createPollingTransportError('Polling relay request was aborted.')
            : (error as FlockError);
        this.emitErrorSignal(flockError);
        this.handleTransportFailure(flockError.message);
        return;
      }
    }
  }

  private async sendSignal(signal: RoomTransportSignal): Promise<void> {
    const sessionId = this.sessionId;
    if (!sessionId || !this.connected) {
      return;
    }

    const payload = serializeWebSocketRelayMessage({
      type: 'transport',
      signal,
      session: this.resolveOutboundSession(signal),
    });
    const response = await this.fetchImpl(`${this.resolveSessionUrl(sessionId)}/messages`, {
      method: 'POST',
      headers: {
        ...this.createPayloadHeaders(payload),
        ...this.createAuthHeaders(),
      },
      body: payload,
    }).catch((error) => {
      throw createPollingTransportError('Failed to send polling transport message.', error);
    });

    if (response.ok) {
      return;
    }

    const flockError = await readRelayResponseError(
      response,
      'Polling relay rejected a transport frame.',
    );
    this.emitErrorSignal(flockError);
    this.handleTransportFailure(flockError.message);
  }

  private handleServerMessage(message: WebSocketRelayServerMessage): void {
    if (message.type === 'transport') {
      if (message.signal.type === 'hello' || message.signal.type === 'welcome') {
        const compatible = this.updatePeerNegotiationState(
          message.signal.fromPeerId,
          message.signal.payload.protocol,
        );
        if (!compatible) {
          return;
        }
      } else if (
        message.signal.fromPeerId !== this.peerId &&
        this.peerCapabilities.has(message.signal.fromPeerId) &&
        !this.peerSessions.has(message.signal.fromPeerId)
      ) {
        return;
      }

      this.emitTransportSignal(message.signal);
      return;
    }

    if (message.type === 'peer-joined') {
      this.updatePeerNegotiationState(message.peerId, message.protocol);
      return;
    }

    if (message.type === 'peer-left') {
      this.peerSessions.delete(message.peerId);
      this.peerCapabilities.delete(message.peerId);
      this.emitTransportSignal({
        type: 'leave',
        roomId: message.roomId,
        fromPeerId: message.peerId,
        timestamp: Date.now(),
        payload: {},
      });
      return;
    }

    if (message.type === 'error') {
      this.emitErrorSignal(createRelayMessageError(message.message, message.code));
    }
  }

  private initializePeerNegotiationState(peers: WebSocketRelayPeerDescriptor[]): void {
    this.peerSessions.clear();
    this.peerCapabilities.clear();

    for (const peer of peers) {
      this.updatePeerNegotiationState(peer.peerId, peer.protocol);
    }
  }

  private updatePeerNegotiationState(
    peerId: string,
    remoteProtocol: PeerProtocolCapabilities | undefined,
  ): boolean {
    this.peerCapabilities.set(peerId, remoteProtocol);

    const result = negotiateTransportProtocolSession('polling', remoteProtocol);
    if (!result.compatible) {
      this.peerSessions.delete(peerId);
      return false;
    }

    this.peerSessions.set(peerId, result.session);
    return true;
  }

  private resolveOutboundSession(signal: RoomTransportSignal): PeerProtocolSession {
    if (signal.type === 'hello' || signal.type === 'welcome') {
      return getBootstrapProtocolSession();
    }

    return {
      version: 2,
      codec: 'msgpack',
      legacy: false,
    };
  }

  private resolveSessionUrl(sessionId: string): string {
    return resolveRelayHttpUrl(
      this.relayUrl,
      `${POLLING_EVENTS_PATH}/${encodeURIComponent(sessionId)}`,
    );
  }

  private createAuthHeaders(): Record<string, string> {
    if (!this.relayAuthToken) {
      return {};
    }

    return {
      authorization: `Bearer ${this.relayAuthToken}`,
    };
  }

  private createPayloadHeaders(payload: string | Uint8Array): Record<string, string> {
    return payload instanceof Uint8Array
      ? {
          'content-type': 'application/msgpack',
          accept: 'application/json',
        }
      : {
          'content-type': 'application/json; charset=utf-8',
          accept: 'application/json',
        };
  }

  private emitTransportSignal(signal: TransportSignal): void {
    for (const listener of this.listeners) {
      listener(signal);
    }
  }

  private emitErrorSignal(error: FlockError): void {
    this.emitTransportSignal({
      type: 'transport:error',
      roomId: this.roomId,
      fromPeerId: this.peerId,
      payload: {
        error,
      },
    });
  }

  private handleTransportFailure(reason: string): void {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.pollController?.abort();
    this.pollController = null;
    this.emitTransportSignal({
      type: 'transport:disconnected',
      roomId: this.roomId,
      fromPeerId: this.peerId,
      payload: {
        reason,
      },
    });
  }
}

export function createPollingTransportAdapter<TPresence extends PresenceData = PresenceData>(
  roomId: string,
  peerId: string,
  options: RoomOptions<TPresence>,
  fetchImpl?: FetchLike,
): TransportAdapter {
  return new PollingTransportAdapter(roomId, peerId, options, fetchImpl);
}
