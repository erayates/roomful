import type { DevtoolsBridge } from './types.js';

export {
  DEVTOOLS_BRIDGE_GLOBAL,
  DEVTOOLS_BRIDGE_VERSION,
  DEVTOOLS_MAX_EVENT_LOG_ENTRIES,
} from './constants.js';
export { diffSerializedState } from './diff.js';
export { isDevtoolsRoomSnapshot, isDevtoolsRoomSummary } from './guards.js';
export { serializeDevtoolsValue } from './serialize.js';
export type {
  DevtoolsBridge,
  DevtoolsCommandResult,
  DevtoolsDiffKind,
  DevtoolsDiffOptions,
  DevtoolsEventDirection,
  DevtoolsEventLogEntry,
  DevtoolsPeerSnapshot,
  DevtoolsRoomSnapshot,
  DevtoolsRoomStatus,
  DevtoolsRoomSummary,
  DevtoolsSerializationOptions,
  DevtoolsSerializedRecord,
  DevtoolsSerializedScalar,
  DevtoolsSerializedValue,
  DevtoolsStateDiffEntry,
  DevtoolsStateReason,
  DevtoolsStateSnapshot,
  DevtoolsStateStrategy,
  DevtoolsTransportKind,
} from './types.js';

declare global {
  interface Window {
    /**
     * Exposes the devtools bridge that `@roomful/core` registers on `window`.
     * The property key mirrors {@link DEVTOOLS_BRIDGE_GLOBAL}.
     *
     * @experimental The bridge protocol is experimental; the single-integer
     * `version` has no negotiation and may change.
     */
    __roomful_devtools__?: DevtoolsBridge;
  }
}
