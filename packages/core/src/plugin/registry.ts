import type { Room } from '../room';
import type { PluginPeerContext, RoomPlugin } from './types';

/**
 * Manages a set of plugins for a Room.
 *
 * Each hook dispatches to all registered plugins in registration order.
 * Hooks are synchronous internally but can return Promises; the caller
 * may await the returned Promise if it needs to wait for all plugins.
 */
export class PluginRegistry {
  private readonly plugins: RoomPlugin[] = [];

  public constructor(initialPlugins: RoomPlugin[] = []) {
    for (const plugin of initialPlugins) {
      this.register(plugin);
    }
  }

  /**
   * Registers a plugin. Duplicate names are silently skipped.
   */
  public register(plugin: RoomPlugin): void {
    if (this.plugins.some((p) => p.name === plugin.name)) {
      return;
    }
    this.plugins.push(plugin);
  }

  /**
   * Unregisters a plugin by name.
   */
  public unregister(name: string): void {
    const index = this.plugins.findIndex((p) => p.name === name);
    if (index !== -1) {
      this.plugins.splice(index, 1);
    }
  }

  /** Returns the list of registered plugins. */
  public list(): ReadonlyArray<RoomPlugin> {
    return [...this.plugins];
  }

  // ── Hook dispatchers ──────────────────────────────────────────────────

  public async onRoomConnect(room: Room): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onRoomConnect?.(room);
    }
  }

  public async onRoomDisconnect(room: Room): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onRoomDisconnect?.(room);
    }
  }

  public async onPeerJoin(peer: PluginPeerContext): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onPeerJoin?.(peer);
    }
  }

  public async onPeerLeave(peer: PluginPeerContext): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onPeerLeave?.(peer);
    }
  }

  public async onPresenceUpdate(peer: PluginPeerContext): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onPresenceUpdate?.(peer);
    }
  }

  public async onError(error: Error): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.onError?.(error);
    }
  }
}
