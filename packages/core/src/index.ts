import { CahootsError } from './cahoots-error';
import { createRoom } from './room';

export { createRoom };
export { CahootsError };
export type {
  AwarenessEngine,
  AwarenessSelection,
  AwarenessState,
  CahootsErrorCode,
  CahootsYjsProvider,
  CahootsYjsProviderEventHandler,
  CahootsYjsProviderEventMap,
  CahootsYjsProviderEventName,
  CahootsYjsProviderStatus,
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
 * Reports package-level health metadata for `@cahoots/core`.
 */
export interface CoreHealth {
  /**
   * Identifies the package.
   */
  packageName: '@cahoots/core';

  /**
   * Reports the package health state.
   */
  status: 'ok';
}

/**
 * Returns package-level health metadata for `@cahoots/core`.
 *
 * @returns The static core package health payload.
 */
export function createCoreHealth(): CoreHealth {
  return {
    packageName: '@cahoots/core',
    status: 'ok',
  };
}
