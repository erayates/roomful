/**
 * Roomful Plugin API — alpha
 *
 * Plugins extend a room's behaviour by hooking into lifecycle events.
 *
 * ```ts
 * import { createRoom } from '@roomful/core';
 *
 * const loggerPlugin: RoomPlugin = {
 *   name: 'logger',
 *   onPeerJoin(peer) { console.log('peer joined', peer.id); },
 *   onPeerLeave(peer) { console.log('peer left', peer.id); },
 * };
 *
 * const room = createRoom('my-room', { plugins: [loggerPlugin] });
 * ```
 */

import type { Room } from '../room';

/** Arbitrary metadata a plugin can attach to a peer. */
export interface PluginPeerContext {
  id: string;
  [key: string]: unknown;
}

/**
 * A Roomful plugin.
 *
 * All hooks are optional. Hooks run synchronously and are awaited by the
 * room runtime in registration order.
 */
export interface RoomPlugin {
  /** Unique plugin name. Used for deduplication and debugging. */
  name: string;

  /** Called after the room connects to a transport. */
  onRoomConnect?(room: Room): void | Promise<void>;

  /** Called after the room disconnects. */
  onRoomDisconnect?(room: Room): void | Promise<void>;

  /** Called when a new peer joins the room. */
  onPeerJoin?(peer: PluginPeerContext): void | Promise<void>;

  /** Called when a peer leaves the room. */
  onPeerLeave?(peer: PluginPeerContext): void | Promise<void>;

  /** Called when a peer's presence data changes. */
  onPresenceUpdate?(peer: PluginPeerContext): void | Promise<void>;

  /** Called when an error occurs. */
  onError?(error: Error): void | Promise<void>;
}
