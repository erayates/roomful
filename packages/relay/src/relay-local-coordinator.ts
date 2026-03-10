import type { RelayRoomCoordinator } from './relay-coordinator.js';
import type {
  RelayCoordinatorMessage,
  RelayJoinPeer,
  RelayJoinRequest,
  RelayJoinResult,
} from './relay-coordinator.js';

interface LocalRelayRoomState {
  peers: Map<string, RelayJoinPeer>;
  capacity?: number;
}

export class LocalRelayRoomCoordinator implements RelayRoomCoordinator {
  public readonly mode = 'local';

  private readonly rooms = new Map<string, LocalRelayRoomState>();

  public async start(): Promise<void> {
    return undefined;
  }

  public async stop(): Promise<void> {
    this.rooms.clear();
  }

  public isReady(): boolean {
    return true;
  }

  public async subscribe(roomId: string): Promise<void> {
    void roomId;
    return undefined;
  }

  public async unsubscribe(roomId: string): Promise<void> {
    void roomId;
    return undefined;
  }

  public async join(request: RelayJoinRequest): Promise<RelayJoinResult> {
    const room = this.rooms.get(request.roomId) ?? {
      peers: new Map<string, RelayJoinPeer>(),
      ...(request.maxPeers !== undefined ? { capacity: request.maxPeers } : {}),
    };

    if (room.peers.has(request.peerId)) {
      return {
        ok: false,
        code: 'PEER_EXISTS',
        message: 'PeerId already exists in this room.',
      };
    }

    if (room.capacity !== undefined && room.peers.size >= room.capacity) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        message: 'Room is full.',
      };
    }

    const peers = Array.from(room.peers.values());
    room.peers.set(request.peerId, {
      peerId: request.peerId,
      ...(request.protocol ? { protocol: request.protocol } : {}),
    });
    this.rooms.set(request.roomId, room);

    return {
      ok: true,
      peers,
    };
  }

  public async leave(roomId: string, peerId: string): Promise<void> {
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

  public async publish(message: RelayCoordinatorMessage): Promise<void> {
    void message;
    return undefined;
  }

  public onMessage(handler: (message: RelayCoordinatorMessage) => void): () => void {
    void handler;
    return (): void => undefined;
  }
}

export function createLocalRelayRoomCoordinator(): RelayRoomCoordinator {
  return new LocalRelayRoomCoordinator();
}
