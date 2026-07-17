import { describe, expect, it, vi } from 'vitest';

import { PluginRegistry } from './registry.js';
import type { RoomPlugin } from './types.js';

describe('PluginRegistry', () => {
  it('registers and lists plugins', () => {
    const registry = new PluginRegistry();
    const plugin: RoomPlugin = { name: 'test' };
    registry.register(plugin);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.name).toBe('test');
  });

  it('skips duplicate names', () => {
    const registry = new PluginRegistry();
    registry.register({ name: 'dup' });
    registry.register({ name: 'dup' });
    expect(registry.list()).toHaveLength(1);
  });

  it('unregisters by name', () => {
    const registry = new PluginRegistry();
    registry.register({ name: 'a' });
    registry.register({ name: 'b' });
    registry.unregister('a');
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.name).toBe('b');
  });

  it('accepts initial plugins via constructor', () => {
    const plugin: RoomPlugin = { name: 'built-in' };
    const registry = new PluginRegistry([plugin]);
    expect(registry.list()).toHaveLength(1);
  });

  it('calls onRoomConnect on registered plugins', async () => {
    const fn = vi.fn();
    const registry = new PluginRegistry([{ name: 't', onRoomConnect: fn }]);
    await registry.onRoomConnect({} as never);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onPeerJoin and onPeerLeave', async () => {
    const joinFn = vi.fn();
    const leaveFn = vi.fn();
    const registry = new PluginRegistry([
      {
        name: 't',
        onPeerJoin: joinFn,
        onPeerLeave: leaveFn,
      },
    ]);
    const peer = { id: 'p1' };
    await registry.onPeerJoin(peer);
    expect(joinFn).toHaveBeenCalledWith(peer);
    await registry.onPeerLeave(peer);
    expect(leaveFn).toHaveBeenCalledWith(peer);
  });

  it('calls onPresenceUpdate', async () => {
    const fn = vi.fn();
    const registry = new PluginRegistry([{ name: 't', onPresenceUpdate: fn }]);
    await registry.onPresenceUpdate({ id: 'p1' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onError', async () => {
    const fn = vi.fn();
    const registry = new PluginRegistry([{ name: 't', onError: fn }]);
    await registry.onError(new Error('test'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls multiple plugins in registration order', async () => {
    const order: string[] = [];
    const a: RoomPlugin = {
      name: 'a',
      onRoomConnect: async () => {
        order.push('a');
      },
    };
    const b: RoomPlugin = {
      name: 'b',
      onRoomConnect: async () => {
        order.push('b');
      },
    };
    const registry = new PluginRegistry([a, b]);
    await registry.onRoomConnect({} as never);
    expect(order).toEqual(['a', 'b']);
  });

  it('handles plugins without hooks gracefully', async () => {
    const registry = new PluginRegistry([{ name: 'noop' }]);
    await expect(registry.onRoomConnect({} as never)).resolves.toBeUndefined();
  });
});
