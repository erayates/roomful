import { verifyRelayJwtEdge } from './edge-auth.js';
import {
  type EdgeConnection,
  EdgeRoom,
  type EdgeRoomAuthorize,
  type EdgeRoomOptions,
} from './edge-room.js';

// Cloudflare Workers + Durable Objects adapter for the relay. One Durable Object instance
// per room (`env.ROOMS.idFromName(roomId)`) holds that room's peers via an `EdgeRoom`, so no
// cross-instance coordinator is needed. This file is deploy-tested only; the reusable,
// unit-tested logic lives in `./edge-room` and `./edge-auth`.
//
// Minimal ambient shapes for the Cloudflare-specific globals are declared locally so the
// package needs neither `@cloudflare/workers-types` nor a DOM-lib swap. Deploy with the
// `nodejs_compat` flag off — the reused protocol only ever sees string/ArrayBuffer frames.

interface CfMessageEvent {
  data: string | ArrayBuffer;
}

interface CfWebSocket {
  accept(): void;
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', listener: (event: CfMessageEvent) => void): void;
  addEventListener(type: 'close', listener: () => void): void;
  addEventListener(type: 'error', listener: () => void): void;
}

interface CfResponseInit extends ResponseInit {
  webSocket: CfWebSocket;
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectState {
  readonly id: DurableObjectId;
}

declare const WebSocketPair: {
  new (): { 0: CfWebSocket; 1: CfWebSocket };
};

/**
 * Cloudflare environment bindings for the relay Worker.
 */
export interface RelayEdgeEnv {
  /**
   * Durable Object namespace bound to {@link RoomDurableObject}.
   */
  ROOMS: DurableObjectNamespace;

  /**
   * Enables HS256 JWT authorization when set.
   */
  RELAY_AUTH_SECRET?: string;

  /**
   * Caps peers per room (parsed from the string binding).
   */
  RELAY_MAX_ROOM_SIZE?: string;
}

const HEALTH_BODY = '{"status":"ok"}';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function parseMaxRoomSize(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeData(data: string | ArrayBuffer): string | Uint8Array {
  return typeof data === 'string' ? data : new Uint8Array(data);
}

function resolveAuthorize(secret: string | undefined): EdgeRoomAuthorize | undefined {
  if (secret === undefined) {
    return undefined;
  }

  return async (_peerId, _roomId, token) => {
    if (token === undefined) {
      return false;
    }

    await verifyRelayJwtEdge(token, secret);
    return true;
  };
}

/**
 * A Durable Object that relays one room's traffic. Cloudflare routes every connection for a
 * given room id to a single instance of this class.
 */
export class RoomDurableObject {
  private room: EdgeRoom | null = null;

  public constructor(
    _state: DurableObjectState,
    private readonly env: RelayEdgeEnv,
  ) {}

  public fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(HEALTH_BODY, { status: 200, headers: JSON_HEADERS });
    }

    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }

    const roomId = url.searchParams.get('room');
    if (!roomId) {
      return new Response('Missing room query parameter.', { status: 400 });
    }

    const token = url.searchParams.get('token') ?? undefined;
    const room = this.resolveRoom(roomId);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const connection: EdgeConnection = {
      send: (data) => {
        server.send(data);
      },
      close: (code, reason) => {
        server.close(code, reason);
      },
    };

    server.addEventListener('message', (event) => {
      void room.handleMessage(connection, normalizeData(event.data), token).catch(() => undefined);
    });
    server.addEventListener('close', () => {
      room.removeConnection(connection);
    });
    server.addEventListener('error', () => {
      room.removeConnection(connection);
    });

    const init: CfResponseInit = { status: 101, webSocket: client };
    return new Response(null, init);
  }

  private resolveRoom(roomId: string): EdgeRoom {
    const existing = this.room;
    if (existing) {
      return existing;
    }

    const maxRoomSize = parseMaxRoomSize(this.env.RELAY_MAX_ROOM_SIZE);
    const authorize = resolveAuthorize(this.env.RELAY_AUTH_SECRET);
    const options: EdgeRoomOptions = {
      roomId,
      ...(maxRoomSize !== undefined ? { maxRoomSize } : {}),
      ...(authorize !== undefined ? { authorize } : {}),
    };
    const room = new EdgeRoom(options);
    this.room = room;
    return room;
  }
}

/**
 * The Worker entry: routes each room's WebSocket upgrade to its Durable Object.
 */
export default {
  async fetch(request: Request, env: RelayEdgeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(HEALTH_BODY, { status: 200, headers: JSON_HEADERS });
    }

    const roomId = url.searchParams.get('room');
    if (!roomId) {
      return new Response('Missing room query parameter.', { status: 400 });
    }

    const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
    return stub.fetch(request);
  },
};
