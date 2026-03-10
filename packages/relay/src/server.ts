import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import type { Duplex } from 'node:stream';

import { type RawData, type WebSocket, WebSocketServer } from 'ws';

import {
  parseRelayClientMessage,
  type RelayClientMessage,
  type RelayPeerJoinedMessage,
  type RelayPeerLeftMessage,
  type RelayTransportMessage,
  resolveRelayTransportSession,
  serializeRelayServerMessage,
  serializeRelayTransportMessage,
} from './protocol.js';
import type { RelayCoordinatorMessage, RelayRoomCoordinator } from './relay-coordinator.js';
import { createLocalRelayRoomCoordinator } from './relay-local-coordinator.js';
import { createRedisRelayRoomCoordinator } from './relay-redis-coordinator.js';
import type { RelayRedisStore, RelayRedisStoreOptions } from './relay-redis-store.js';

const HEALTH_RESPONSE_BODY = '{"status":"ok"}';
const SHUTDOWN_TIMEOUT_MS = 1_000;
const AUTH_CLOSE_CODE = 4_401;
const AUTH_CLOSE_REASON = 'auth-failed';
const REDIS_UNAVAILABLE_CODE = 'REDIS_UNAVAILABLE';
const REDIS_UNAVAILABLE_MESSAGE = 'Redis coordination is unavailable.';
const POLLING_PATH_SUFFIX = '/poll/sessions';
const POLLING_DEFAULT_TIMEOUT_MS = 25_000;
const POLLING_MAX_TIMEOUT_MS = 25_000;
const POLLING_IDLE_TIMEOUT_MS = 60_000;
const POLLING_CLEANUP_INTERVAL_MS = 15_000;
const MAX_HTTP_BODY_BYTES = 1024 * 1024;

interface RelayPeerContext {
  roomId: string;
  peerId: string;
  protocol?: Extract<RelayClientMessage, { type: 'join' }>['protocol'];
}

interface PendingPollRequest {
  response: ServerResponse;
  timer: ReturnType<typeof setTimeout>;
}

interface RelayPollingSession {
  sessionId: string;
  context: RelayPeerContext;
  queue: RelayCoordinatorMessage[];
  pendingPoll: PendingPollRequest | null;
  lastSeenAt: number;
}

interface RelayRoom {
  peers: Map<string, WebSocket>;
}

interface RelayPollingRoom {
  peers: Map<string, RelayPollingSession>;
}

/**
 * Exposes the public relay server API.
 */
export interface RelayServer {
  /**
   * Reports the configured listening port.
   */
  readonly port: number;

  /**
   * Registers a token-based auth handler.
   *
   * @param handler - The auth handler invoked for token-bearing join requests.
   * @returns The relay server for chaining.
   */
  auth(handler: RelayAuthHandler): RelayServer;

  /**
   * Starts listening for relay traffic.
   *
   * @returns A promise that resolves when the server starts listening.
   */
  start(): Promise<void>;

  /**
   * Stops the relay server and closes active connections.
   *
   * @returns A promise that resolves when shutdown completes.
   */
  stop(): Promise<void>;

  /**
   * Returns the base HTTP address for the running server.
   *
   * @returns The server address.
   */
  getAddress(): string;
}

/**
 * Handles relay auth checks for token-bearing join requests.
 *
 * @param peerId - The joining peer identifier.
 * @param roomId - The requested room identifier.
 * @param token - The resolved bearer token.
 * @returns `false` to reject the join, otherwise a truthy/void success result.
 */
export type RelayAuthHandler = (
  peerId: string,
  roomId: string,
  token: string,
) => void | boolean | Promise<void | boolean>;

/**
 * Describes an authorization request passed to `authorize`.
 */
export interface RelayAuthorizeContext {
  /**
   * Identifies the requested room.
   */
  roomId: string;

  /**
   * Identifies the joining peer.
   */
  peerId: string;

  /**
   * Exposes the resolved bearer token when present.
   */
  token?: string;

  /**
   * Exposes the incoming HTTP upgrade or polling request.
   */
  request: IncomingMessage;
}

/**
 * Configures the public relay server.
 */
export interface RelayServerOptions {
  /**
   * Selects the listening port.
   */
  port: number;

  /**
   * Selects the listening host.
   */
  host?: string;

  /**
   * Caps concurrent peer connections.
   */
  maxConnections?: number;

  /**
   * Runs custom authorization before accepting a peer.
   */
  authorize?: (context: RelayAuthorizeContext) => void | boolean | Promise<void | boolean>;

  /**
   * Enables Redis coordination across relay instances.
   */
  redisUrl?: string;
}

export interface RelayServerInternalOptions extends RelayServerOptions {
  createRedisStore?: (options: RelayRedisStoreOptions) => RelayRedisStore;
}

function normalizeRawData(data: RawData, isBinary: boolean): string | Uint8Array {
  if (typeof data === 'string') {
    return data;
  }

  if (!isBinary) {
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8');
    }

    if (Array.isArray(data)) {
      return Buffer.concat(data).toString('utf8');
    }

    return data.toString('utf8');
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }

  return new Uint8Array(data);
}

function resolveRequestPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://relay.local').pathname;
  } catch {
    return '/';
  }
}

function resolveAuthTokenQuery(
  request: IncomingMessage,
): { ok: true; token: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(request.url ?? '/', 'http://relay.local');
  } catch {
    return {
      ok: false,
      reason: 'invalid-request-url',
    };
  }

  const tokens = url.searchParams.getAll('token');
  if (tokens.length === 0) {
    return {
      ok: false,
      reason: 'missing-token',
    };
  }

  if (tokens.length > 1) {
    return {
      ok: false,
      reason: 'duplicate-token',
    };
  }

  const [token] = tokens;
  if (!token) {
    return {
      ok: false,
      reason: 'empty-token',
    };
  }

  return {
    ok: true,
    token,
  };
}

function resolveAuthorizationHeaderToken(
  request: IncomingMessage,
): { ok: true; token: string } | { ok: false; reason: string } {
  const headerValue = readSingleHeaderValue(request.headers, 'authorization');
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return {
      ok: false,
      reason: 'missing-token',
    };
  }

  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  if (!match) {
    return {
      ok: false,
      reason: 'invalid-authorization-header',
    };
  }

  const [, token] = match;
  if (!token || token.trim().length === 0) {
    return {
      ok: false,
      reason: 'empty-token',
    };
  }

  return {
    ok: true,
    token: token.trim(),
  };
}

function isPollingSessionsCollectionPath(path: string): boolean {
  return path === POLLING_PATH_SUFFIX || path.endsWith(POLLING_PATH_SUFFIX);
}

function parsePollingSessionPath(path: string): {
  sessionId: string;
  action: 'base' | 'events' | 'messages';
} | null {
  const match = /\/poll\/sessions\/([^/]+?)(?:\/(events|messages))?$/.exec(path);
  if (!match) {
    return null;
  }

  const [, encodedSessionId, action] = match;
  if (!encodedSessionId) {
    return null;
  }

  try {
    return {
      sessionId: decodeURIComponent(encodedSessionId),
      action: action === 'events' || action === 'messages' ? action : 'base',
    };
  } catch {
    return null;
  }
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > MAX_HTTP_BODY_BYTES) {
        cleanup();
        reject(new Error(`Request body exceeded ${MAX_HTTP_BODY_BYTES} bytes.`));
        return;
      }

      chunks.push(buffer);
    };

    const onEnd = (): void => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const cleanup = (): void => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
    };

    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
  });
}

function parsePollingTimeout(request: IncomingMessage): number {
  try {
    const url = new URL(request.url ?? '/', 'http://relay.local');
    const rawValue = url.searchParams.get('timeoutMs');
    const parsed = rawValue === null ? NaN : Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return POLLING_DEFAULT_TIMEOUT_MS;
    }

    return Math.min(parsed, POLLING_MAX_TIMEOUT_MS);
  } catch {
    return POLLING_DEFAULT_TIMEOUT_MS;
  }
}

function sendJsonResponse(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function resolvePeerIp(request: IncomingMessage): string {
  const forwardedValue = readSingleHeaderValue(request.headers, 'x-forwarded-for');
  if (typeof forwardedValue === 'string') {
    const [firstHop] = forwardedValue.split(',');
    if (firstHop && firstHop.trim().length > 0) {
      return firstHop.trim();
    }
  }

  return request.socket.remoteAddress ?? 'unknown';
}

function normalizeLogValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function readSingleHeaderValue(
  headers: IncomingHttpHeaders,
  name: 'authorization' | 'content-type' | 'x-forwarded-for',
): string | undefined {
  const value = headers[name];
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' ? first : undefined;
  }

  return undefined;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeMaxConnections(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw createRelayServerConfigurationError(`Invalid maxConnections value "${value}".`);
  }

  return value;
}

function createRelayServerConfigurationError(message: string): TypeError {
  const error = new TypeError(message);
  error.name = 'RelayServerConfigurationError';
  return error;
}

function rejectUpgrade(socket: Duplex, statusCode: number, statusText: string): void {
  if (socket.destroyed) {
    return;
  }

  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

function waitForSocketClose(socket: WebSocket, timeoutMs = SHUTDOWN_TIMEOUT_MS): Promise<void> {
  if (socket.readyState === 3) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      socket.off('close', onClose);
      socket.off('error', onError);
      resolve();
    };

    const onClose = (): void => {
      finish();
    };

    const onError = (): void => {
      finish();
    };

    const timer = setTimeout(() => {
      socket.off('close', onClose);
      socket.off('error', onError);
      socket.terminate();
      resolve();
    }, timeoutMs);

    socket.once('close', onClose);
    socket.once('error', onError);
  });
}

function createRelayRoomCoordinator(options: RelayServerInternalOptions): RelayRoomCoordinator {
  if (!options.redisUrl) {
    return createLocalRelayRoomCoordinator();
  }

  return createRedisRelayRoomCoordinator({
    redisUrl: options.redisUrl,
    ...(options.createRedisStore ? { createStore: options.createRedisStore } : {}),
    onError: (message, error) => {
      process.stderr.write(
        `[relay] ${message} error=${normalizeLogValue(readErrorMessage(error))}\n`,
      );
    },
  });
}

export class RelayServerImpl implements RelayServer {
  private httpServer: HttpServer | null = null;

  private wsServer: WebSocketServer | null = null;

  private readonly contexts = new WeakMap<WebSocket, RelayPeerContext>();

  private readonly pendingAuthTokens = new WeakMap<WebSocket, string>();

  private readonly rooms = new Map<string, RelayRoom>();

  private readonly pollingRooms = new Map<string, RelayPollingRoom>();

  private readonly pollingSessions = new Map<string, RelayPollingSession>();

  private readonly coordinator: RelayRoomCoordinator;

  private currentPort: number;

  private readonly host: string;

  private readonly maxConnections: number | undefined;

  private authHandler: RelayAuthHandler | null = null;

  private stopPromise: Promise<void> | null = null;

  private stopping = false;

  private pollingCleanupInterval: ReturnType<typeof setInterval> | null = null;

  public constructor(private readonly options: RelayServerInternalOptions) {
    this.currentPort = options.port;
    this.host = options.host ?? '127.0.0.1';
    this.maxConnections = normalizeMaxConnections(options.maxConnections);
    this.coordinator = createRelayRoomCoordinator(options);
    this.coordinator.onMessage((message) => {
      this.handleCoordinatorMessage(message);
    });
  }

  public get port(): number {
    return this.currentPort;
  }

  public auth(handler: RelayAuthHandler): RelayServer {
    if (this.options.authorize) {
      throw createRelayServerConfigurationError(
        'Relay auth cannot be configured with both `authorize` and `auth()`.',
      );
    }

    if (this.httpServer || this.wsServer) {
      throw createRelayServerConfigurationError('Relay auth must be configured before start().');
    }

    this.authHandler = handler;
    return this;
  }

  public getAddress(): string {
    return `ws://${this.host}:${this.currentPort}`;
  }

  public async start(): Promise<void> {
    if (this.httpServer || this.wsServer) {
      return;
    }

    if (this.stopPromise) {
      await this.stopPromise;
    }

    await this.coordinator.start();

    try {
      const httpServer = createServer((request, response) => {
        this.handleHttpRequest(request, response);
      });
      const wsServer = new WebSocketServer({
        noServer: true,
      });

      wsServer.on('connection', (socket, request) => {
        this.handleConnection(socket, request);
      });

      httpServer.on('upgrade', (request, socket, head) => {
        this.handleUpgrade(wsServer, request, socket, head);
      });

      await new Promise<void>((resolve, reject) => {
        const onListening = (): void => {
          httpServer.off('error', onError);
          const address = httpServer.address();
          if (address && typeof address !== 'string') {
            this.currentPort = address.port;
          }
          resolve();
        };

        const onError = (error: Error): void => {
          httpServer.off('listening', onListening);
          reject(error);
        };

        httpServer.once('listening', onListening);
        httpServer.once('error', onError);
        httpServer.listen(this.options.port, this.host);
      });

      this.stopping = false;
      this.pollingCleanupInterval = setInterval(() => {
        void this.cleanupExpiredPollingSessions();
      }, POLLING_CLEANUP_INTERVAL_MS);
      this.httpServer = httpServer;
      this.wsServer = wsServer;
    } catch (error) {
      await this.coordinator.stop();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    const httpServer = this.httpServer;
    const wsServer = this.wsServer;
    if (!httpServer || !wsServer) {
      return;
    }

    this.stopping = true;
    this.httpServer = null;
    this.wsServer = null;

    this.stopPromise = (async () => {
      try {
        const closeHttpServer = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            httpServer.closeAllConnections();
            resolve();
          }, SHUTDOWN_TIMEOUT_MS);
          httpServer.close((error) => {
            clearTimeout(timer);
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });

        const clients = Array.from(wsServer.clients);
        const closeClients = clients.map((client) => {
          return waitForSocketClose(client);
        });
        const pollingSessionIds = Array.from(this.pollingSessions.keys());

        for (const client of clients) {
          client.close(1000, 'server-stop');
        }

        await Promise.all([
          Promise.all(closeClients),
          Promise.all(
            pollingSessionIds.map((sessionId) => {
              return this.removePollingSession(sessionId);
            }),
          ),
        ]);

        await Promise.all([
          new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              resolve();
            }, SHUTDOWN_TIMEOUT_MS);
            wsServer.close(() => {
              clearTimeout(timer);
              resolve();
            });
          }),
          closeHttpServer,
        ]);
      } finally {
        this.rooms.clear();
        this.pollingRooms.clear();
        this.pollingSessions.clear();
        if (this.pollingCleanupInterval) {
          clearInterval(this.pollingCleanupInterval);
          this.pollingCleanupInterval = null;
        }
        await this.coordinator.stop();
        this.stopPromise = null;
        this.stopping = false;
      }
    })();

    return this.stopPromise;
  }

  private handleHttpRequest(request: IncomingMessage, response: ServerResponse): void {
    const path = resolveRequestPath(request);
    if (request.method === 'GET' && path === '/health') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(HEALTH_RESPONSE_BODY);
      return;
    }

    if (path.includes(POLLING_PATH_SUFFIX)) {
      void this.handlePollingHttpRequest(request, response).catch((error) => {
        this.logRelayError('Polling HTTP request failed.', error);
        if (!response.headersSent) {
          sendJsonResponse(response, 500, {
            code: 'INTERNAL_ERROR',
            message: 'Internal relay error.',
          });
        } else if (!response.writableEnded) {
          response.end();
        }
      });
      return;
    }

    response.statusCode = 404;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end('Not Found');
  }

  private handleUpgrade(
    wsServer: WebSocketServer,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    if (this.stopping) {
      rejectUpgrade(socket, 503, 'Service Unavailable');
      return;
    }

    if (this.maxConnections !== undefined && wsServer.clients.size >= this.maxConnections) {
      rejectUpgrade(socket, 503, 'Service Unavailable');
      return;
    }

    const authToken = this.prepareUpgradeAuth(request, socket);
    if (authToken === null) {
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (websocket) => {
      if (this.stopping) {
        websocket.close(1012, 'server-stop');
        return;
      }

      if (authToken !== undefined) {
        this.pendingAuthTokens.set(websocket, authToken);
      }

      wsServer.emit('connection', websocket, request);
    });
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    socket.on('message', (rawData, isBinary) => {
      const payload = normalizeRawData(rawData, isBinary);
      const message = parseRelayClientMessage(payload);
      if (!message) {
        this.sendError(socket, 'INVALID_MESSAGE', 'Invalid signaling message.');
        return;
      }

      void this.handleClientMessage(socket, request, message).catch((error) => {
        this.logRelayError('Client message handling failed.', error);
      });
    });

    socket.on('close', () => {
      this.pendingAuthTokens.delete(socket);
      void this.removePeerFromRoom(socket).catch((error) => {
        this.logRelayError('Socket cleanup failed.', error);
      });
    });

    socket.on('error', () => {
      this.pendingAuthTokens.delete(socket);
      void this.removePeerFromRoom(socket).catch((error) => {
        this.logRelayError('Socket cleanup failed.', error);
      });
    });
  }

  private async handleClientMessage(
    socket: WebSocket,
    request: IncomingMessage,
    message: RelayClientMessage,
  ): Promise<void> {
    if (message.type === 'join') {
      await this.handleJoinMessage(socket, request, message);
      return;
    }

    const context = this.contexts.get(socket);
    if (!context) {
      this.sendError(socket, 'NOT_JOINED', 'Peer must join a room before signaling.');
      return;
    }

    if (message.type === 'leave') {
      if (message.roomId !== context.roomId) {
        this.sendError(socket, 'ROOM_MISMATCH', 'Leave roomId does not match joined room.');
        return;
      }

      if (message.peerId !== context.peerId) {
        this.sendError(socket, 'PEER_MISMATCH', 'PeerId mismatch for leave request.');
        return;
      }

      await this.removePeerFromRoom(socket);
      return;
    }

    if (message.type === 'signal') {
      if (message.roomId !== context.roomId) {
        this.sendError(socket, 'ROOM_MISMATCH', 'Signal roomId does not match joined room.');
        return;
      }

      if (message.fromPeerId !== context.peerId) {
        this.sendError(socket, 'PEER_MISMATCH', 'Signal sender peerId mismatch.');
        return;
      }

      await this.forwardSignal(context.roomId, message);
      return;
    }

    if (message.signal.roomId !== context.roomId) {
      this.sendError(socket, 'ROOM_MISMATCH', 'Transport roomId does not match joined room.');
      return;
    }

    if (message.signal.fromPeerId !== context.peerId) {
      this.sendError(socket, 'PEER_MISMATCH', 'Transport sender peerId mismatch.');
      return;
    }

    await this.forwardTransport(context.roomId, context.peerId, message);
  }

  private async handleJoinMessage(
    socket: WebSocket,
    request: IncomingMessage,
    message: Extract<RelayClientMessage, { type: 'join' }>,
  ): Promise<void> {
    const existingContext = this.contexts.get(socket);
    if (existingContext) {
      this.sendError(socket, 'ALREADY_JOINED', 'Socket already joined a room.');
      return;
    }

    const authorized = await this.authorizeWebSocketJoin(socket, request, message);
    if (!authorized) {
      return;
    }

    if (!this.coordinator.isReady()) {
      this.sendRedisUnavailableError(socket);
      return;
    }

    let subscribed = false;
    try {
      await this.coordinator.subscribe(message.roomId);
      subscribed = true;

      const joinResult = await this.coordinator.join({
        roomId: message.roomId,
        peerId: message.peerId,
        ...(message.protocol ? { protocol: message.protocol } : {}),
        ...(message.maxPeers !== undefined ? { maxPeers: message.maxPeers } : {}),
      });
      if (!joinResult.ok) {
        await this.coordinator.unsubscribe(message.roomId);
        this.sendError(socket, joinResult.code, joinResult.message);
        return;
      }

      const room = this.rooms.get(message.roomId) ?? {
        peers: new Map<string, WebSocket>(),
      };
      room.peers.set(message.peerId, socket);
      this.rooms.set(message.roomId, room);
      this.contexts.set(socket, {
        roomId: message.roomId,
        peerId: message.peerId,
        ...(message.protocol ? { protocol: message.protocol } : {}),
      });
      this.pendingAuthTokens.delete(socket);

      socket.send(
        serializeRelayServerMessage({
          type: 'joined',
          roomId: message.roomId,
          peerId: message.peerId,
          peers: this.mapJoinPeers(joinResult.peers),
        }),
      );

      const peerJoinedMessage: RelayPeerJoinedMessage = {
        type: 'peer-joined',
        roomId: message.roomId,
        peerId: message.peerId,
        ...(message.protocol ? { protocol: message.protocol } : {}),
      };
      this.broadcastToLocalRooms(message.roomId, message.peerId, peerJoinedMessage);
      await this.publishCoordinatorMessage(peerJoinedMessage);
    } catch (error) {
      if (subscribed) {
        await this.coordinator.unsubscribe(message.roomId).catch(() => {
          return undefined;
        });
      }

      this.logRelayError('Join coordination failed.', error);
      this.sendRedisUnavailableError(socket);
    }
  }

  private isAuthEnabled(): boolean {
    return this.authHandler !== null || this.options.authorize !== undefined;
  }

  private prepareUpgradeAuth(request: IncomingMessage, socket: Duplex): string | undefined | null {
    if (!this.isAuthEnabled()) {
      return undefined;
    }

    const tokenResult = resolveAuthTokenQuery(request);
    if (!tokenResult.ok) {
      this.logAuthFailure(request, {
        reason: tokenResult.reason,
      });
      rejectUpgrade(socket, 401, 'Unauthorized');
      return null;
    }

    return tokenResult.token;
  }

  private async authorizeWebSocketJoin(
    socket: WebSocket,
    request: IncomingMessage,
    message: Extract<RelayClientMessage, { type: 'join' }>,
  ): Promise<boolean> {
    const token = this.pendingAuthTokens.get(socket);
    const result = await this.validateJoinAuthorization(request, message, token);
    if (result.ok) {
      return true;
    }

    this.pendingAuthTokens.delete(socket);
    this.logAuthFailure(request, {
      reason: result.reason,
      roomId: message.roomId,
      peerId: message.peerId,
      error: result.error,
    });
    this.sendError(socket, 'AUTH_FAILED', 'Authorization failed.');
    socket.close(AUTH_CLOSE_CODE, AUTH_CLOSE_REASON);
    return false;
  }

  private async validateJoinAuthorization(
    request: IncomingMessage,
    message: Extract<RelayClientMessage, { type: 'join' }>,
    token: string | undefined,
  ): Promise<{ ok: true } | { ok: false; reason: string; error?: unknown }> {
    if (!this.isAuthEnabled()) {
      return { ok: true };
    }

    if (!token) {
      return {
        ok: false,
        reason: 'missing-token',
      };
    }

    try {
      const allowed =
        this.authHandler !== null
          ? await this.authHandler(message.peerId, message.roomId, token)
          : await this.options.authorize?.({
              roomId: message.roomId,
              peerId: message.peerId,
              token,
              request,
            });

      if (allowed === false) {
        return {
          ok: false,
          reason: 'rejected',
        };
      }
    } catch (error) {
      return {
        ok: false,
        reason: 'error',
        error,
      };
    }

    return { ok: true };
  }

  private logAuthFailure(
    request: IncomingMessage,
    details: {
      reason: string;
      roomId?: string;
      peerId?: string;
      error?: unknown;
    },
  ): void {
    const parts = ['[relay] auth rejected', `ip=${resolvePeerIp(request)}`];

    if (details.roomId) {
      parts.push(`roomId=${details.roomId}`);
    }

    if (details.peerId) {
      parts.push(`peerId=${details.peerId}`);
    }

    parts.push(`reason=${normalizeLogValue(details.reason)}`);

    if (details.error !== undefined) {
      parts.push(`error=${normalizeLogValue(readErrorMessage(details.error))}`);
    }

    process.stderr.write(`${parts.join(' ')}\n`);
  }

  private mapJoinPeers(
    peers: Array<{
      peerId: string;
      protocol?: Extract<RelayClientMessage, { type: 'join' }>['protocol'];
    }>,
  ): Extract<Parameters<typeof serializeRelayServerMessage>[0], { type: 'joined' }>['peers'] {
    const mappedPeers: Extract<
      Parameters<typeof serializeRelayServerMessage>[0],
      { type: 'joined' }
    >['peers'] = [];

    for (const peer of peers) {
      const protocol = peer.protocol;
      if (protocol === undefined) {
        mappedPeers.push({
          peerId: peer.peerId,
        });
        continue;
      }

      mappedPeers.push({
        peerId: peer.peerId,
        protocol,
      });
    }

    return mappedPeers;
  }

  private async handlePollingHttpRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const path = resolveRequestPath(request);
    if (request.method === 'POST' && isPollingSessionsCollectionPath(path)) {
      await this.handlePollingJoinRequest(request, response);
      return;
    }

    const sessionPath = parsePollingSessionPath(path);
    if (!sessionPath) {
      response.statusCode = 404;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end('Not Found');
      return;
    }

    if (request.method === 'GET' && sessionPath.action === 'events') {
      this.handlePollingEventsRequest(request, response, sessionPath.sessionId);
      return;
    }

    if (request.method === 'POST' && sessionPath.action === 'messages') {
      await this.handlePollingMessageRequest(request, response, sessionPath.sessionId);
      return;
    }

    if (request.method === 'DELETE' && sessionPath.action === 'base') {
      await this.handlePollingDeleteRequest(response, sessionPath.sessionId);
      return;
    }

    sendJsonResponse(response, 405, {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
    });
  }

  private async handlePollingJoinRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const tokenResult = this.resolvePollingAuthToken(request);
    if (!tokenResult.ok) {
      this.logAuthFailure(request, {
        reason: tokenResult.reason,
      });
      sendJsonResponse(response, 401, {
        code: 'AUTH_FAILED',
        message: 'Authorization failed.',
      });
      return;
    }

    let message: RelayClientMessage | null = null;
    try {
      const body = await readRequestBody(request);
      message = parseRelayClientMessage(body.toString('utf8'));
    } catch (error) {
      this.logRelayError('Polling join body read failed.', error);
    }

    if (!message || message.type !== 'join') {
      sendJsonResponse(response, 400, {
        code: 'INVALID_MESSAGE',
        message: 'Invalid join message.',
      });
      return;
    }

    const authorized = await this.validateJoinAuthorization(request, message, tokenResult.token);
    if (!authorized.ok) {
      this.logAuthFailure(request, {
        reason: authorized.reason,
        roomId: message.roomId,
        peerId: message.peerId,
        ...(authorized.error !== undefined ? { error: authorized.error } : {}),
      });
      sendJsonResponse(response, 401, {
        code: 'AUTH_FAILED',
        message: 'Authorization failed.',
      });
      return;
    }

    if (!this.coordinator.isReady()) {
      sendJsonResponse(response, 503, {
        code: REDIS_UNAVAILABLE_CODE,
        message: REDIS_UNAVAILABLE_MESSAGE,
      });
      return;
    }

    let subscribed = false;
    try {
      await this.coordinator.subscribe(message.roomId);
      subscribed = true;

      const joinResult = await this.coordinator.join({
        roomId: message.roomId,
        peerId: message.peerId,
        ...(message.protocol ? { protocol: message.protocol } : {}),
        ...(message.maxPeers !== undefined ? { maxPeers: message.maxPeers } : {}),
      });
      if (!joinResult.ok) {
        await this.coordinator.unsubscribe(message.roomId);
        sendJsonResponse(response, joinResult.code === 'ROOM_FULL' ? 409 : 400, {
          code: joinResult.code,
          message: joinResult.message,
        });
        return;
      }

      const sessionId = randomUUID();
      const session: RelayPollingSession = {
        sessionId,
        context: {
          roomId: message.roomId,
          peerId: message.peerId,
          ...(message.protocol ? { protocol: message.protocol } : {}),
        },
        queue: [],
        pendingPoll: null,
        lastSeenAt: Date.now(),
      };
      this.addPollingSession(session);

      sendJsonResponse(response, 200, {
        type: 'joined',
        sessionId,
        roomId: message.roomId,
        peerId: message.peerId,
        peers: this.mapJoinPeers(joinResult.peers),
      });

      const peerJoinedMessage: RelayPeerJoinedMessage = {
        type: 'peer-joined',
        roomId: message.roomId,
        peerId: message.peerId,
        ...(message.protocol ? { protocol: message.protocol } : {}),
      };
      this.broadcastToLocalRooms(message.roomId, message.peerId, peerJoinedMessage);
      await this.publishCoordinatorMessage(peerJoinedMessage);
    } catch (error) {
      if (subscribed) {
        await this.coordinator.unsubscribe(message.roomId).catch(() => {
          return undefined;
        });
      }

      this.logRelayError('Polling join coordination failed.', error);
      sendJsonResponse(response, 503, {
        code: REDIS_UNAVAILABLE_CODE,
        message: REDIS_UNAVAILABLE_MESSAGE,
      });
    }
  }

  private handlePollingEventsRequest(
    request: IncomingMessage,
    response: ServerResponse,
    sessionId: string,
  ): void {
    const session = this.pollingSessions.get(sessionId);
    if (!session) {
      sendJsonResponse(response, 404, {
        code: 'NOT_JOINED',
        message: 'Polling session was not found.',
      });
      return;
    }

    this.touchPollingSession(session);

    const queuedMessage = session.queue.shift();
    if (queuedMessage) {
      this.sendPollingEventResponse(response, session, queuedMessage);
      return;
    }

    if (session.pendingPoll) {
      sendJsonResponse(response, 409, {
        code: 'CONCURRENT_POLL',
        message: 'Only one polling event request may be active at a time.',
      });
      return;
    }

    const timeoutMs = parsePollingTimeout(request);
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (session.pendingPoll?.response !== response) {
        return;
      }

      session.pendingPoll = null;
      response.statusCode = 204;
      response.end();
    }, timeoutMs);

    request.once('close', () => {
      if (session.pendingPoll?.response !== response) {
        return;
      }

      clearTimeout(timer);
      session.pendingPoll = null;
    });

    session.pendingPoll = {
      response,
      timer,
    };
  }

  private async handlePollingMessageRequest(
    request: IncomingMessage,
    response: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    const session = this.pollingSessions.get(sessionId);
    if (!session) {
      sendJsonResponse(response, 404, {
        code: 'NOT_JOINED',
        message: 'Polling session was not found.',
      });
      return;
    }

    this.touchPollingSession(session);

    let message: RelayClientMessage | null = null;
    try {
      const body = await readRequestBody(request);
      const contentTypeValue = readSingleHeaderValue(request.headers, 'content-type');
      message =
        typeof contentTypeValue === 'string' && contentTypeValue.includes('application/msgpack')
          ? parseRelayClientMessage(new Uint8Array(body))
          : parseRelayClientMessage(body.toString('utf8'));
    } catch (error) {
      this.logRelayError('Polling message body read failed.', error);
    }

    if (!message || message.type !== 'transport') {
      sendJsonResponse(response, 400, {
        code: 'INVALID_MESSAGE',
        message: 'Polling message endpoint only accepts transport frames.',
      });
      return;
    }

    if (message.signal.roomId !== session.context.roomId) {
      sendJsonResponse(response, 400, {
        code: 'ROOM_MISMATCH',
        message: 'Transport roomId does not match joined room.',
      });
      return;
    }

    if (message.signal.fromPeerId !== session.context.peerId) {
      sendJsonResponse(response, 400, {
        code: 'PEER_MISMATCH',
        message: 'Transport sender peerId mismatch.',
      });
      return;
    }

    await this.forwardTransport(session.context.roomId, session.context.peerId, message);
    response.statusCode = 202;
    response.end();
  }

  private async handlePollingDeleteRequest(
    response: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    const session = this.pollingSessions.get(sessionId);
    if (!session) {
      response.statusCode = 204;
      response.end();
      return;
    }

    await this.removePollingSession(sessionId);
    response.statusCode = 204;
    response.end();
  }

  private resolvePollingAuthToken(
    request: IncomingMessage,
  ): { ok: true; token: string | undefined } | { ok: false; reason: string } {
    if (!this.isAuthEnabled()) {
      return {
        ok: true,
        token: undefined,
      };
    }

    const headerResult = resolveAuthorizationHeaderToken(request);
    if (!headerResult.ok) {
      return headerResult;
    }

    return {
      ok: true,
      token: headerResult.token,
    };
  }

  private addPollingSession(session: RelayPollingSession): void {
    const room = this.pollingRooms.get(session.context.roomId) ?? {
      peers: new Map<string, RelayPollingSession>(),
    };
    room.peers.set(session.context.peerId, session);
    this.pollingRooms.set(session.context.roomId, room);
    this.pollingSessions.set(session.sessionId, session);
  }

  private touchPollingSession(session: RelayPollingSession): void {
    session.lastSeenAt = Date.now();
  }

  private sendPollingEventResponse(
    response: ServerResponse,
    session: RelayPollingSession,
    message: RelayCoordinatorMessage,
  ): void {
    this.touchPollingSession(session);
    const payload =
      message.type === 'transport'
        ? serializeRelayTransportMessage(message, {
            transportSession: resolveRelayTransportSession(session.context.protocol),
          })
        : serializeRelayServerMessage(message);

    response.statusCode = 200;
    if (payload instanceof Uint8Array) {
      response.setHeader('content-type', 'application/msgpack');
      response.end(Buffer.from(payload));
      return;
    }

    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(payload);
  }

  private queuePollingMessage(
    session: RelayPollingSession,
    message: RelayCoordinatorMessage,
  ): void {
    this.touchPollingSession(session);
    if (session.pendingPoll) {
      const pendingPoll = session.pendingPoll;
      session.pendingPoll = null;
      clearTimeout(pendingPoll.timer);
      this.sendPollingEventResponse(pendingPoll.response, session, message);
      return;
    }

    session.queue.push(message);
  }

  private async removePollingSession(sessionId: string): Promise<void> {
    const session = this.pollingSessions.get(sessionId);
    if (!session) {
      return;
    }

    this.pollingSessions.delete(sessionId);
    const room = this.pollingRooms.get(session.context.roomId);
    if (room) {
      room.peers.delete(session.context.peerId);
      if (room.peers.size === 0) {
        this.pollingRooms.delete(session.context.roomId);
      } else {
        this.pollingRooms.set(session.context.roomId, room);
      }
    }

    if (session.pendingPoll) {
      clearTimeout(session.pendingPoll.timer);
      sendJsonResponse(session.pendingPoll.response, 410, {
        code: 'SESSION_EXPIRED',
        message: 'Polling session ended.',
      });
      session.pendingPoll = null;
    }

    await this.coordinator.leave(session.context.roomId, session.context.peerId).catch((error) => {
      this.logRelayError('Polling leave coordination failed.', error);
    });

    const peerLeftMessage: RelayPeerLeftMessage = {
      type: 'peer-left',
      roomId: session.context.roomId,
      peerId: session.context.peerId,
    };
    this.broadcastToLocalRooms(session.context.roomId, session.context.peerId, peerLeftMessage);
    await this.publishCoordinatorMessage(peerLeftMessage);

    const hasWebSocketPeers = (this.rooms.get(session.context.roomId)?.peers.size ?? 0) > 0;
    const hasPollingPeers = (this.pollingRooms.get(session.context.roomId)?.peers.size ?? 0) > 0;
    if (!hasWebSocketPeers && !hasPollingPeers) {
      await this.coordinator.unsubscribe(session.context.roomId).catch((error) => {
        this.logRelayError('Polling room unsubscribe failed.', error);
      });
    }
  }

  private async cleanupExpiredPollingSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessionIds: string[] = [];
    for (const [sessionId, session] of this.pollingSessions.entries()) {
      if (now - session.lastSeenAt >= POLLING_IDLE_TIMEOUT_MS) {
        expiredSessionIds.push(sessionId);
      }
    }

    for (const sessionId of expiredSessionIds) {
      await this.removePollingSession(sessionId).catch((error) => {
        this.logRelayError('Polling session cleanup failed.', error);
      });
    }
  }

  private broadcastToLocalRooms(
    roomId: string,
    excludePeerId: string,
    message: RelayPeerJoinedMessage | RelayPeerLeftMessage,
  ): void {
    this.broadcastToLocalRoom(roomId, excludePeerId, message);
    this.broadcastToLocalPollingRoom(roomId, excludePeerId, message);
  }

  private broadcastToLocalPollingRoom(
    roomId: string,
    excludePeerId: string,
    message: RelayPeerJoinedMessage | RelayPeerLeftMessage,
  ): void {
    const room = this.pollingRooms.get(roomId);
    if (!room) {
      return;
    }

    for (const [peerId, session] of room.peers.entries()) {
      if (peerId === excludePeerId) {
        continue;
      }

      this.queuePollingMessage(session, message);
    }
  }

  private async forwardSignal(
    roomId: string,
    message: Extract<RelayClientMessage, { type: 'signal' }>,
  ): Promise<void> {
    const target = this.rooms.get(roomId)?.peers.get(message.toPeerId);
    if (target) {
      target.send(serializeRelayServerMessage(message));
      return;
    }

    await this.publishCoordinatorMessage(message);
  }

  private async forwardTransport(
    roomId: string,
    senderPeerId: string,
    message: Extract<RelayClientMessage, { type: 'transport' }>,
  ): Promise<void> {
    if (message.signal.toPeerId) {
      const websocketTarget = this.rooms.get(roomId)?.peers.get(message.signal.toPeerId);
      if (websocketTarget) {
        this.sendTransportToSocket(websocketTarget, message);
        return;
      }

      const pollingTarget = this.pollingRooms.get(roomId)?.peers.get(message.signal.toPeerId);
      if (pollingTarget) {
        this.sendTransportToPollingSession(pollingTarget, message);
        return;
      }

      await this.publishCoordinatorMessage(message);
      return;
    }

    const websocketRoom = this.rooms.get(roomId);
    if (websocketRoom) {
      for (const [peerId, peerSocket] of websocketRoom.peers.entries()) {
        if (peerId === senderPeerId) {
          continue;
        }

        this.sendTransportToSocket(peerSocket, message);
      }
    }

    const pollingRoom = this.pollingRooms.get(roomId);
    if (pollingRoom) {
      for (const [peerId, session] of pollingRoom.peers.entries()) {
        if (peerId === senderPeerId) {
          continue;
        }

        this.sendTransportToPollingSession(session, message);
      }
    }

    await this.publishCoordinatorMessage(message);
  }

  private async removePeerFromRoom(socket: WebSocket): Promise<void> {
    this.pendingAuthTokens.delete(socket);
    const context = this.contexts.get(socket);
    if (!context) {
      return;
    }

    this.contexts.delete(socket);

    const room = this.rooms.get(context.roomId);
    if (!room) {
      return;
    }

    room.peers.delete(context.peerId);
    if (room.peers.size === 0) {
      this.rooms.delete(context.roomId);
    } else {
      this.rooms.set(context.roomId, room);
    }

    await this.coordinator.leave(context.roomId, context.peerId).catch((error) => {
      this.logRelayError('Leave coordination failed.', error);
    });

    const peerLeftMessage: RelayPeerLeftMessage = {
      type: 'peer-left',
      roomId: context.roomId,
      peerId: context.peerId,
    };
    this.broadcastToLocalRooms(context.roomId, context.peerId, peerLeftMessage);
    await this.publishCoordinatorMessage(peerLeftMessage);

    const hasPollingPeers = (this.pollingRooms.get(context.roomId)?.peers.size ?? 0) > 0;
    if (room.peers.size === 0 && !hasPollingPeers) {
      await this.coordinator.unsubscribe(context.roomId).catch((error) => {
        this.logRelayError('Room unsubscribe failed.', error);
      });
    }
  }

  private handleCoordinatorMessage(message: RelayCoordinatorMessage): void {
    if (message.type === 'peer-joined' || message.type === 'peer-left') {
      this.broadcastToLocalRooms(message.roomId, message.peerId, message);
      return;
    }

    if (message.type === 'signal') {
      const target = this.rooms.get(message.roomId)?.peers.get(message.toPeerId);
      if (!target) {
        return;
      }

      target.send(serializeRelayServerMessage(message));
      return;
    }

    if (message.signal.toPeerId) {
      const websocketTarget = this.rooms
        .get(message.signal.roomId)
        ?.peers.get(message.signal.toPeerId);
      if (websocketTarget) {
        this.sendTransportToSocket(websocketTarget, message);
        return;
      }

      const pollingTarget = this.pollingRooms
        .get(message.signal.roomId)
        ?.peers.get(message.signal.toPeerId);
      if (pollingTarget) {
        this.sendTransportToPollingSession(pollingTarget, message);
      }

      return;
    }

    const websocketRoom = this.rooms.get(message.signal.roomId);
    if (websocketRoom) {
      for (const [peerId, socket] of websocketRoom.peers.entries()) {
        if (peerId === message.signal.fromPeerId) {
          continue;
        }

        this.sendTransportToSocket(socket, message);
      }
    }

    const pollingRoom = this.pollingRooms.get(message.signal.roomId);
    if (!pollingRoom) {
      return;
    }

    for (const [peerId, session] of pollingRoom.peers.entries()) {
      if (peerId === message.signal.fromPeerId) {
        continue;
      }

      this.sendTransportToPollingSession(session, message);
    }
  }

  private sendTransportToSocket(socket: WebSocket, message: RelayTransportMessage): void {
    const targetContext = this.contexts.get(socket);
    socket.send(
      serializeRelayTransportMessage(message, {
        transportSession: resolveRelayTransportSession(targetContext?.protocol),
      }),
    );
  }

  private sendTransportToPollingSession(
    session: RelayPollingSession,
    message: Extract<RelayClientMessage, { type: 'transport' }>,
  ): void {
    this.queuePollingMessage(session, message);
  }

  private broadcastToLocalRoom(
    roomId: string,
    excludePeerId: string,
    message: RelayPeerJoinedMessage | RelayPeerLeftMessage,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const payload = serializeRelayServerMessage(message);
    for (const [peerId, socket] of room.peers.entries()) {
      if (peerId === excludePeerId) {
        continue;
      }

      socket.send(payload);
    }
  }

  private async publishCoordinatorMessage(message: RelayCoordinatorMessage): Promise<void> {
    try {
      await this.coordinator.publish(message);
    } catch (error) {
      this.logRelayError('Remote relay publish failed.', error);
    }
  }

  private sendRedisUnavailableError(socket: WebSocket): void {
    this.sendError(socket, REDIS_UNAVAILABLE_CODE, REDIS_UNAVAILABLE_MESSAGE);
  }

  private logRelayError(message: string, error: unknown): void {
    process.stderr.write(
      `[relay] ${message} error=${normalizeLogValue(readErrorMessage(error))}\n`,
    );
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    socket.send(
      serializeRelayServerMessage({
        type: 'error',
        code,
        message,
      }),
    );
  }
}

/**
 * Creates a relay server instance.
 *
 * @param options - The relay server configuration.
 * @returns The created relay server.
 */
export function createRelayServer(options: RelayServerOptions): RelayServer {
  return new RelayServerImpl(options);
}
