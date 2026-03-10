import {
  createServer,
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
  resolveRelayTransportSession,
  serializeRelayServerMessage,
  serializeRelayTransportMessage,
} from './protocol';
import type { RelayCoordinatorMessage, RelayRoomCoordinator } from './relay-coordinator';
import { createLocalRelayRoomCoordinator } from './relay-local-coordinator';
import { createRedisRelayRoomCoordinator } from './relay-redis-coordinator';
import type { RelayRedisStore, RelayRedisStoreOptions } from './relay-redis-store';

const HEALTH_RESPONSE_BODY = '{"status":"ok"}';
const SHUTDOWN_TIMEOUT_MS = 1_000;
const AUTH_CLOSE_CODE = 4_401;
const AUTH_CLOSE_REASON = 'auth-failed';
const REDIS_UNAVAILABLE_CODE = 'REDIS_UNAVAILABLE';
const REDIS_UNAVAILABLE_MESSAGE = 'Redis coordination is unavailable.';

interface RelayPeerContext {
  roomId: string;
  peerId: string;
  protocol?: Extract<RelayClientMessage, { type: 'join' }>['protocol'];
}

interface RelayRoom {
  peers: Map<string, WebSocket>;
}

export interface RelayServer {
  readonly port: number;
  auth(handler: RelayAuthHandler): RelayServer;
  start(): Promise<void>;
  stop(): Promise<void>;
  getAddress(): string;
}

export type RelayAuthHandler = (
  peerId: string,
  roomId: string,
  token: string,
) => void | boolean | Promise<void | boolean>;

export interface RelayAuthorizeContext {
  roomId: string;
  peerId: string;
  token?: string;
  request: IncomingMessage;
}

export interface RelayServerOptions {
  port: number;
  host?: string;
  maxConnections?: number;
  authorize?: (context: RelayAuthorizeContext) => void | boolean | Promise<void | boolean>;
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

function resolvePeerIp(request: IncomingMessage): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
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
      process.stderr.write(`[relay] ${message} error=${normalizeLogValue(readErrorMessage(error))}\n`);
    },
  });
}

export class RelayServerImpl implements RelayServer {
  private httpServer: HttpServer | null = null;

  private wsServer: WebSocketServer | null = null;

  private readonly contexts = new WeakMap<WebSocket, RelayPeerContext>();

  private readonly pendingAuthTokens = new WeakMap<WebSocket, string>();

  private readonly rooms = new Map<string, RelayRoom>();

  private readonly coordinator: RelayRoomCoordinator;

  private currentPort: number;

  private readonly host: string;

  private readonly maxConnections: number | undefined;

  private authHandler: RelayAuthHandler | null = null;

  private stopPromise: Promise<void> | null = null;

  private stopping = false;

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
          httpServer.close((error) => {
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

        for (const client of clients) {
          client.close(1000, 'server-stop');
        }

        await Promise.all(closeClients);

        await Promise.all([
          new Promise<void>((resolve) => {
            wsServer.close(() => {
              resolve();
            });
          }),
          closeHttpServer,
        ]);
      } finally {
        this.rooms.clear();
        await this.coordinator.stop();
        this.stopPromise = null;
        this.stopping = false;
      }
    })();

    return this.stopPromise;
  }

  private handleHttpRequest(request: IncomingMessage, response: ServerResponse): void {
    if (request.method === 'GET' && resolveRequestPath(request) === '/health') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(HEALTH_RESPONSE_BODY);
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

    const authorized = await this.authorizeJoin(socket, request, message);
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
          peers: joinResult.peers.map((peer) => {
            return peer.protocol
              ? {
                  peerId: peer.peerId,
                  protocol: peer.protocol,
                }
              : {
                  peerId: peer.peerId,
                };
          }),
        }),
      );

      const peerJoinedMessage: RelayPeerJoinedMessage = {
        type: 'peer-joined',
        roomId: message.roomId,
        peerId: message.peerId,
        ...(message.protocol ? { protocol: message.protocol } : {}),
      };
      this.broadcastToLocalRoom(message.roomId, message.peerId, peerJoinedMessage);
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

  private async authorizeJoin(
    socket: WebSocket,
    request: IncomingMessage,
    message: Extract<RelayClientMessage, { type: 'join' }>,
  ): Promise<boolean> {
    if (!this.isAuthEnabled()) {
      return true;
    }

    const token = this.pendingAuthTokens.get(socket);
    if (!token) {
      this.rejectUnauthorizedJoin(socket, request, message, 'missing-token');
      return false;
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
        this.rejectUnauthorizedJoin(socket, request, message, 'rejected');
        return false;
      }
    } catch (error) {
      this.rejectUnauthorizedJoin(socket, request, message, 'error', error);
      return false;
    }

    return true;
  }

  private rejectUnauthorizedJoin(
    socket: WebSocket,
    request: IncomingMessage,
    message: Extract<RelayClientMessage, { type: 'join' }>,
    reason: string,
    error?: unknown,
  ): void {
    this.pendingAuthTokens.delete(socket);
    this.logAuthFailure(request, {
      reason,
      roomId: message.roomId,
      peerId: message.peerId,
      error,
    });
    this.sendError(socket, 'AUTH_FAILED', 'Authorization failed.');
    socket.close(AUTH_CLOSE_CODE, AUTH_CLOSE_REASON);
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
    const room = this.rooms.get(roomId);
    if (message.signal.toPeerId) {
      const target = room?.peers.get(message.signal.toPeerId);
      if (target) {
        this.sendTransportToSocket(target, message);
        return;
      }

      await this.publishCoordinatorMessage(message);
      return;
    }

    if (room) {
      for (const [peerId, peerSocket] of room.peers.entries()) {
        if (peerId === senderPeerId) {
          continue;
        }

        this.sendTransportToSocket(peerSocket, message);
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
    this.broadcastToLocalRoom(context.roomId, context.peerId, peerLeftMessage);
    await this.publishCoordinatorMessage(peerLeftMessage);

    if (room.peers.size === 0) {
      await this.coordinator.unsubscribe(context.roomId).catch((error) => {
        this.logRelayError('Room unsubscribe failed.', error);
      });
    }
  }

  private handleCoordinatorMessage(message: RelayCoordinatorMessage): void {
    if (message.type === 'peer-joined' || message.type === 'peer-left') {
      this.broadcastToLocalRoom(message.roomId, message.peerId, message);
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
      const target = this.rooms.get(message.signal.roomId)?.peers.get(message.signal.toPeerId);
      if (!target) {
        return;
      }

      this.sendTransportToSocket(target, message);
      return;
    }

    const room = this.rooms.get(message.signal.roomId);
    if (!room) {
      return;
    }

    for (const [peerId, socket] of room.peers.entries()) {
      if (peerId === message.signal.fromPeerId) {
        continue;
      }

      this.sendTransportToSocket(socket, message);
    }
  }

  private sendTransportToSocket(socket: WebSocket, message: Extract<RelayClientMessage, { type: 'transport' }>): void;
  private sendTransportToSocket(socket: WebSocket, message: Extract<RelayCoordinatorMessage, { type: 'transport' }>): void;
  private sendTransportToSocket(socket: WebSocket, message: Extract<RelayCoordinatorMessage, { type: 'transport' }>): void {
    const targetContext = this.contexts.get(socket);
    socket.send(
      serializeRelayTransportMessage(message, {
        transportSession: resolveRelayTransportSession(targetContext?.protocol),
      }),
    );
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
    process.stderr.write(`[relay] ${message} error=${normalizeLogValue(readErrorMessage(error))}\n`);
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

export function createRelayServer(options: RelayServerOptions): RelayServer {
  return new RelayServerImpl(options);
}
