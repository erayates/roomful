import type { Unsubscribe } from '../types';
import {
  DEVTOOLS_BRIDGE_GLOBAL,
  DEVTOOLS_BRIDGE_VERSION,
  type DevtoolsBridge,
  type DevtoolsCommandResult,
  type DevtoolsRoomSnapshot,
  type DevtoolsRoomSummary,
} from './devtools';
import { env } from './env';

interface RoomDevtoolsAdapter {
  disconnectSimulatedPeer(): DevtoolsCommandResult;
  getSnapshot(): DevtoolsRoomSnapshot;
  getSummary(): DevtoolsRoomSummary;
  injectSimulatedPeer(): DevtoolsCommandResult;
  readonly instanceId: string;
}

const roomAdapters = new Map<string, RoomDevtoolsAdapter>();

function getWindowObject(): Window | null {
  if (!env.isBrowser) {
    return null;
  }

  return globalThis.window;
}

function getBridge(): DevtoolsBridge {
  return {
    disconnectSimulatedPeer(instanceId) {
      const adapter = roomAdapters.get(instanceId);
      if (!adapter) {
        return {
          error: `Unknown room instance "${instanceId}".`,
          ok: false,
        };
      }

      return adapter.disconnectSimulatedPeer();
    },
    getSnapshot(instanceId) {
      return roomAdapters.get(instanceId)?.getSnapshot() ?? null;
    },
    injectSimulatedPeer(instanceId) {
      const adapter = roomAdapters.get(instanceId);
      if (!adapter) {
        return {
          error: `Unknown room instance "${instanceId}".`,
          ok: false,
        };
      }

      return adapter.injectSimulatedPeer();
    },
    listRooms() {
      return Array.from(roomAdapters.values())
        .map((adapter) => {
          return adapter.getSummary();
        })
        .sort((left, right) => {
          return left.roomId.localeCompare(right.roomId) || left.peerId.localeCompare(right.peerId);
        });
    },
    version: DEVTOOLS_BRIDGE_VERSION,
  };
}

export function registerRoomDevtoolsAdapter(adapter: RoomDevtoolsAdapter): Unsubscribe {
  const windowObject = getWindowObject();
  if (!windowObject) {
    return () => {
      return undefined;
    };
  }

  roomAdapters.set(adapter.instanceId, adapter);
  Reflect.set(windowObject, DEVTOOLS_BRIDGE_GLOBAL, getBridge());

  return () => {
    roomAdapters.delete(adapter.instanceId);
    if (roomAdapters.size === 0) {
      Reflect.deleteProperty(windowObject, DEVTOOLS_BRIDGE_GLOBAL);
      return;
    }

    Reflect.set(windowObject, DEVTOOLS_BRIDGE_GLOBAL, getBridge());
  };
}
