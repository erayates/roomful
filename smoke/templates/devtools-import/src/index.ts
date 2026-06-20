import {
  DEVTOOLS_BRIDGE_GLOBAL,
  DEVTOOLS_BRIDGE_VERSION,
  DEVTOOLS_MAX_EVENT_LOG_ENTRIES,
  diffSerializedState,
  isDevtoolsRoomSummary,
  serializeDevtoolsValue,
  type DevtoolsRoomSummary,
} from '@flockjs/devtools';

const summary: DevtoolsRoomSummary = {
  hasSimulatedPeer: false,
  hasState: true,
  instanceId: 'smoke-instance',
  peerCount: 1,
  peerId: 'peer-smoke',
  roomId: 'room-smoke',
  status: 'connected',
  transport: 'broadcast',
};

if (!isDevtoolsRoomSummary(summary)) {
  throw new Error('Devtools room summary guard rejected a valid summary.');
}

const previous = serializeDevtoolsValue({ count: 0 });
const next = serializeDevtoolsValue({ count: 1 });
const diff = diffSerializedState(previous, next);

process.stdout.write(
  JSON.stringify(
    {
      bridgeGlobal: DEVTOOLS_BRIDGE_GLOBAL,
      bridgeVersion: DEVTOOLS_BRIDGE_VERSION,
      diffCount: diff.length,
      maxEvents: DEVTOOLS_MAX_EVENT_LOG_ENTRIES,
    },
    null,
    2,
  ),
);
