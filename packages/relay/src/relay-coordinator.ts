import type {
  RelayClientMessage,
  RelayPeerJoinedMessage,
  RelayPeerLeftMessage,
  RelayServerMessage,
  RelaySignalMessage,
  RelayTransportMessage,
} from './protocol.js';

export type RelayJoinProtocol = Extract<RelayClientMessage, { type: 'join' }>['protocol'];

export interface RelayJoinPeer {
  peerId: string;
  protocol?: RelayJoinProtocol;
}

export interface RelayJoinRequest {
  roomId: string;
  peerId: string;
  protocol?: RelayJoinProtocol;
  maxPeers?: number;
}

export type RelayJoinResult =
  | {
      ok: true;
      peers: RelayJoinPeer[];
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type RelayCoordinatorMessage = Extract<
  RelayServerMessage,
  {
    type: 'peer-joined' | 'peer-left' | 'signal' | 'transport';
  }
>;

export interface RelayRoomCoordinator {
  readonly mode: 'local' | 'redis';
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
  subscribe(roomId: string): Promise<void>;
  unsubscribe(roomId: string): Promise<void>;
  join(request: RelayJoinRequest): Promise<RelayJoinResult>;
  leave(roomId: string, peerId: string): Promise<void>;
  publish(message: RelayCoordinatorMessage): Promise<void>;
  onMessage(handler: (message: RelayCoordinatorMessage) => void): () => void;
}

export type RelayCoordinatorPeerEvent = RelayPeerJoinedMessage | RelayPeerLeftMessage;
export type RelayCoordinatorTargetedMessage = RelaySignalMessage | RelayTransportMessage;
