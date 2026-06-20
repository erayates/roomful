import { createRoom } from './room';
import { RoomfulError } from './roomful-error';

export { createRoom };
export { RoomfulError };
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
  RoomfulErrorCode,
  RoomfulYjsProvider,
  RoomfulYjsProviderEventHandler,
  RoomfulYjsProviderEventMap,
  RoomfulYjsProviderEventName,
  RoomfulYjsProviderStatus,
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
 * Reports package-level health metadata for `@roomful/core`.
 */
export interface CoreHealth {
  /**
   * Identifies the package.
   */
  packageName: '@roomful/core';

  /**
   * Reports the package health state.
   */
  status: 'ok';
}

/**
 * Returns package-level health metadata for `@roomful/core`.
 *
 * @returns The static core package health payload.
 */
export function createCoreHealth(): CoreHealth {
  return {
    packageName: '@roomful/core',
    status: 'ok',
  };
}
