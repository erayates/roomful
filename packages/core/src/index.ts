import { FlockError } from './flock-error';
import { createRoom } from './room';

export { createRoom };
export { FlockError };
export type {
  AwarenessEngine,
  AwarenessSelection,
  AwarenessState,
  CursorBasePosition,
  CursorData,
  CursorEngine,
  CursorOptions,
  CursorPosition,
  CursorRenderOptions,
  DebugOptions,
  EncryptionOptions,
  EventEngine,
  EventOptions,
  FlockErrorCode,
  FlockYjsProvider,
  FlockYjsProviderEventHandler,
  FlockYjsProviderEventMap,
  FlockYjsProviderEventName,
  FlockYjsProviderStatus,
  Peer,
  PresenceData,
  PresenceEngine,
  ReconnectOptions,
  RelayAuthToken,
  Room,
  RoomDiagnostics,
  RoomDiagnosticsDebug,
  RoomDiagnosticsEncryption,
  RoomDiagnosticsEvents,
  RoomDiagnosticsNetwork,
  RoomDiagnosticsPeers,
  RoomDiagnosticsPresence,
  RoomDiagnosticsState,
  RoomDiagnosticsTransport,
  RoomEventHandler,
  RoomEventMap,
  RoomEventName,
  RoomOptions,
  RoomStatus,
  StateChangeMeta,
  StateEngine,
  StateOptions,
  TransportMode,
  Unsubscribe,
  WebRTCDataChannelOptions,
  WebRTCOptions,
  WebSocketOptions,
} from './types';

/**
 * Reports package-level health metadata for `@flockjs/core`.
 */
export interface CoreHealth {
  /**
   * Identifies the package.
   */
  packageName: '@flockjs/core';

  /**
   * Reports the package health state.
   */
  status: 'ok';
}

/**
 * Returns package-level health metadata for `@flockjs/core`.
 *
 * @returns The static core package health payload.
 */
export function createCoreHealth(): CoreHealth {
  return {
    packageName: '@flockjs/core',
    status: 'ok',
  };
}
