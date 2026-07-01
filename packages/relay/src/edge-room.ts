import {
  parseRelayClientMessage,
  type RelayJoinMessage,
  type RelayPeerJoinedMessage,
  type RelayPeerLeftMessage,
  type RelayServerMessage,
  type RelayTransportMessage,
  resolveRelayTransportSession,
  serializeRelayServerMessage,
  serializeRelayTransportMessage,
} from './protocol.js';

// A single room's relay logic, independent of any runtime. On the edge (Cloudflare
// Durable Objects) every connection for a room routes to one instance, so the room holds
// all its peers in memory — no cross-instance coordinator (Redis) is needed, unlike the
// Node `RelayServerImpl`. The wire protocol is reused unchanged from `./protocol`.

type RelayPeerProtocol = RelayJoinMessage['protocol'];

const AUTH_CLOSE_CODE = 4_401;
const AUTH_CLOSE_REASON = 'auth-failed';

/**
 * A runtime's WebSocket-like connection, adapted to the room engine.
 */
export interface EdgeConnection {
  send(data: string | Uint8Array): void;
  close(code: number, reason: string): void;
}

/**
 * Authorizes a join. Return `false` (or throw) to reject.
 */
export type EdgeRoomAuthorize = (
  peerId: string,
  roomId: string,
  token: string | undefined,
) => void | boolean | Promise<void | boolean>;

/**
 * Configures an {@link EdgeRoom}.
 */
export interface EdgeRoomOptions {
  roomId: string;
  maxRoomSize?: number;
  authorize?: EdgeRoomAuthorize;
}

interface EdgePeer {
  peerId: string;
  connection: EdgeConnection;
  protocol?: RelayPeerProtocol;
}

function clampRoomCapacity(
  requested: number | undefined,
  maxRoomSize: number | undefined,
): number | undefined {
  if (maxRoomSize === undefined || !Number.isInteger(maxRoomSize) || maxRoomSize <= 0) {
    return requested;
  }

  if (requested === undefined) {
    return maxRoomSize;
  }

  return Math.min(requested, maxRoomSize);
}

/**
 * Holds the peers of one room and applies the relay protocol to their messages.
 */
export class EdgeRoom {
  private readonly peers = new Map<string, EdgePeer>();

  private readonly peersByConnection = new Map<EdgeConnection, EdgePeer>();

  public constructor(private readonly options: EdgeRoomOptions) {}

  public get size(): number {
    return this.peers.size;
  }

  /**
   * Handles one inbound frame from a connection. `token` is the connection's auth token
   * (from the upgrade request), consulted only for `join`.
   */
  public async handleMessage(
    connection: EdgeConnection,
    raw: string | Uint8Array,
    token?: string,
  ): Promise<void> {
    const message = parseRelayClientMessage(raw);
    if (!message) {
      this.sendError(connection, 'INVALID_MESSAGE', 'Invalid signaling message.');
      return;
    }

    if (message.type === 'join') {
      await this.handleJoin(connection, message, token);
      return;
    }

    const peer = this.peersByConnection.get(connection);
    if (!peer) {
      this.sendError(connection, 'NOT_JOINED', 'Peer must join a room before signaling.');
      return;
    }

    if (message.type === 'leave') {
      if (message.roomId !== this.options.roomId || message.peerId !== peer.peerId) {
        this.sendError(connection, 'ROOM_MISMATCH', 'Leave does not match joined peer.');
        return;
      }

      this.removeConnection(connection);
      return;
    }

    if (message.type === 'signal') {
      if (message.roomId !== this.options.roomId || message.fromPeerId !== peer.peerId) {
        this.sendError(connection, 'ROOM_MISMATCH', 'Signal does not match joined peer.');
        return;
      }

      const target = this.peers.get(message.toPeerId);
      if (target) {
        target.connection.send(serializeRelayServerMessage(message));
      }
      return;
    }

    this.handleTransport(peer, message);
  }

  /**
   * Removes a connection's peer (on socket close or `leave`) and notifies the room.
   */
  public removeConnection(connection: EdgeConnection): void {
    const peer = this.peersByConnection.get(connection);
    if (!peer) {
      return;
    }

    this.peersByConnection.delete(connection);
    this.peers.delete(peer.peerId);

    this.broadcastControl(
      {
        type: 'peer-left',
        roomId: this.options.roomId,
        peerId: peer.peerId,
      },
      peer.peerId,
    );
  }

  private async handleJoin(
    connection: EdgeConnection,
    message: RelayJoinMessage,
    token: string | undefined,
  ): Promise<void> {
    if (this.peersByConnection.has(connection)) {
      this.sendError(connection, 'ALREADY_JOINED', 'Connection already joined a room.');
      return;
    }

    if (message.roomId !== this.options.roomId) {
      this.sendError(connection, 'ROOM_MISMATCH', 'Join roomId does not match this room.');
      return;
    }

    if (!(await this.authorizeJoin(connection, message, token))) {
      return;
    }

    const capacity = clampRoomCapacity(message.maxPeers, this.options.maxRoomSize);
    if (capacity !== undefined && this.peers.size >= capacity) {
      this.sendError(connection, 'ROOM_FULL', 'Room is at capacity.');
      return;
    }

    if (this.peers.has(message.peerId)) {
      this.sendError(connection, 'DUPLICATE_PEER', 'Peer id is already present in the room.');
      return;
    }

    const existingPeers = Array.from(this.peers.values()).map((peer) =>
      peer.protocol !== undefined
        ? { peerId: peer.peerId, protocol: peer.protocol }
        : { peerId: peer.peerId },
    );

    const peer: EdgePeer =
      message.protocol !== undefined
        ? { peerId: message.peerId, connection, protocol: message.protocol }
        : { peerId: message.peerId, connection };
    this.peers.set(peer.peerId, peer);
    this.peersByConnection.set(connection, peer);

    connection.send(
      serializeRelayServerMessage({
        type: 'joined',
        roomId: this.options.roomId,
        peerId: message.peerId,
        peers: existingPeers,
      }),
    );

    const peerJoined: RelayPeerJoinedMessage =
      message.protocol !== undefined
        ? {
            type: 'peer-joined',
            roomId: this.options.roomId,
            peerId: message.peerId,
            protocol: message.protocol,
          }
        : {
            type: 'peer-joined',
            roomId: this.options.roomId,
            peerId: message.peerId,
          };
    this.broadcastControl(peerJoined, message.peerId);
  }

  private async authorizeJoin(
    connection: EdgeConnection,
    message: RelayJoinMessage,
    token: string | undefined,
  ): Promise<boolean> {
    const authorize = this.options.authorize;
    if (!authorize) {
      return true;
    }

    try {
      const allowed = await authorize(message.peerId, message.roomId, token);
      if (allowed === false) {
        this.rejectAuth(connection);
        return false;
      }
    } catch {
      this.rejectAuth(connection);
      return false;
    }

    return true;
  }

  private rejectAuth(connection: EdgeConnection): void {
    this.sendError(connection, 'AUTH_FAILED', 'Authorization failed.');
    connection.close(AUTH_CLOSE_CODE, AUTH_CLOSE_REASON);
  }

  private handleTransport(peer: EdgePeer, message: RelayTransportMessage): void {
    if (
      message.signal.roomId !== this.options.roomId ||
      message.signal.fromPeerId !== peer.peerId
    ) {
      this.sendError(peer.connection, 'ROOM_MISMATCH', 'Transport does not match joined peer.');
      return;
    }

    if (message.signal.toPeerId !== undefined) {
      const target = this.peers.get(message.signal.toPeerId);
      if (target) {
        this.sendTransport(target, message);
      }
      return;
    }

    for (const target of this.peers.values()) {
      if (target.peerId === peer.peerId) {
        continue;
      }

      this.sendTransport(target, message);
    }
  }

  private sendTransport(peer: EdgePeer, message: RelayTransportMessage): void {
    peer.connection.send(
      serializeRelayTransportMessage(message, {
        transportSession: resolveRelayTransportSession(peer.protocol),
      }),
    );
  }

  private broadcastControl(
    message: RelayPeerJoinedMessage | RelayPeerLeftMessage,
    excludePeerId: string,
  ): void {
    const payload = serializeRelayServerMessage(message);
    for (const peer of this.peers.values()) {
      if (peer.peerId === excludePeerId) {
        continue;
      }

      peer.connection.send(payload);
    }
  }

  private sendError(connection: EdgeConnection, code: string, message: string): void {
    const errorMessage: RelayServerMessage = {
      type: 'error',
      code,
      message,
    };
    connection.send(serializeRelayServerMessage(errorMessage));
  }
}
