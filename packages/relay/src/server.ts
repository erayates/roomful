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

const HEALTH_RESPONSE_BODY = '{"status":"ok"}';
const SHUTDOWN_TIMEOUT_MS = 1_000;

interface RelayPeerContext {
  roomId: string;
  peerId: string;
  protocol?: Extract<RelayClientMessage, { type: 'join' }>['protocol'];
}

interface RelayRoom {
  peers: Map<string, WebSocket>;
  capacity?: number;
}

export interface RelayServer {
  readonly port: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  getAddress(): string;
}

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
  authorize?: (context: RelayAuthorizeContext) => boolean | Promise<boolean>;
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

export class RelayServerImpl implements RelayServer {
  private httpServer: HttpServer | null = null;

  private wsServer: WebSocketServer | null = null;

  private readonly contexts = new WeakMap<WebSocket, RelayPeerContext>();

  private readonly rooms = new Map<string, RelayRoom>();

  private currentPort: number;

  private readonly host: string;

  private readonly maxConnections: number | undefined;

  private stopPromise: Promise<void> | null = null;

  private stopping = false;

  public constructor(private readonly options: RelayServerOptions) {
    this.currentPort = options.port;
    this.host = options.host ?? '127.0.0.1';
    this.maxConnections = normalizeMaxConnections(options.maxConnections);
  }

  public get port(): number {
    return this.currentPort;
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

    wsServer.handleUpgrade(request, socket, head, (websocket) => {
      if (this.stopping) {
        websocket.close(1012, 'server-stop');
        return;
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

      void this.handleClientMessage(socket, request, message);
    });

    socket.on('close', () => {
      this.removePeerFromRoom(socket);
    });

    socket.on('error', () => {
      this.removePeerFromRoom(socket);
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

      this.removePeerFromRoom(socket);
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

      this.forwardSignal(context.roomId, message);
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

    this.forwardTransport(context.roomId, context.peerId, message);
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

    if (this.options.authorize) {
      const authorizeContext: RelayAuthorizeContext = {
        roomId: message.roomId,
        peerId: message.peerId,
        request,
        ...(message.token !== undefined ? { token: message.token } : {}),
      };

      const allowed = await this.options.authorize(authorizeContext);

      if (!allowed) {
        this.sendError(socket, 'AUTH_FAILED', 'Authorization failed.');
        return;
      }
    }

    const room = this.rooms.get(message.roomId) ?? {
      peers: new Map<string, WebSocket>(),
      ...(message.maxPeers !== undefined ? { capacity: message.maxPeers } : {}),
    };

    if (room.peers.has(message.peerId)) {
      this.sendError(socket, 'PEER_EXISTS', 'PeerId already exists in this room.');
      return;
    }

    if (room.capacity !== undefined && room.peers.size >= room.capacity) {
      this.sendError(socket, 'ROOM_FULL', 'Room is full.');
      return;
    }

    const existingPeers = Array.from(room.peers.entries()).map(([peerId, peerSocket]) => {
      const peerContext = this.contexts.get(peerSocket);
      return {
        peerId,
        ...(peerContext?.protocol ? { protocol: peerContext.protocol } : {}),
      };
    });
    room.peers.set(message.peerId, socket);
    this.rooms.set(message.roomId, room);
    this.contexts.set(socket, {
      roomId: message.roomId,
      peerId: message.peerId,
      ...(message.protocol ? { protocol: message.protocol } : {}),
    });

    socket.send(
      serializeRelayServerMessage({
        type: 'joined',
        roomId: message.roomId,
        peerId: message.peerId,
        peers: existingPeers,
      }),
    );

    this.broadcastToRoom(message.roomId, message.peerId, {
      type: 'peer-joined',
      roomId: message.roomId,
      peerId: message.peerId,
      ...(message.protocol ? { protocol: message.protocol } : {}),
    });
  }

  private forwardSignal(
    roomId: string,
    message: Extract<RelayClientMessage, { type: 'signal' }>,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const target = room.peers.get(message.toPeerId);
    if (!target) {
      return;
    }

    const outboundSignal: RelayClientMessage = {
      type: 'signal',
      roomId,
      fromPeerId: message.fromPeerId,
      toPeerId: message.toPeerId,
    };

    const signalMessage =
      message.description || message.candidate
        ? {
            ...outboundSignal,
            ...(message.description ? { description: message.description } : {}),
            ...(message.candidate ? { candidate: message.candidate } : {}),
          }
        : outboundSignal;

    target.send(serializeRelayServerMessage(signalMessage));
  }

  private forwardTransport(
    roomId: string,
    senderPeerId: string,
    message: Extract<RelayClientMessage, { type: 'transport' }>,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    if (message.signal.toPeerId) {
      const target = room.peers.get(message.signal.toPeerId);
      if (!target) {
        return;
      }

      const targetContext = this.contexts.get(target);
      target.send(
        serializeRelayTransportMessage(message, {
          transportSession: resolveRelayTransportSession(targetContext?.protocol),
        }),
      );
      return;
    }

    for (const [peerId, socket] of room.peers.entries()) {
      if (peerId === senderPeerId) {
        continue;
      }

      const targetContext = this.contexts.get(socket);
      socket.send(
        serializeRelayTransportMessage(message, {
          transportSession: resolveRelayTransportSession(targetContext?.protocol),
        }),
      );
    }
  }

  private removePeerFromRoom(socket: WebSocket): void {
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
    }

    this.broadcastToRoom(context.roomId, context.peerId, {
      type: 'peer-left',
      roomId: context.roomId,
      peerId: context.peerId,
    });
  }

  private broadcastToRoom(
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
