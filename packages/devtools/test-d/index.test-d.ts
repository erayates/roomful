import { expectType } from 'tsd';

import {
  DEVTOOLS_BRIDGE_GLOBAL,
  DEVTOOLS_BRIDGE_VERSION,
  DEVTOOLS_MAX_EVENT_LOG_ENTRIES,
  diffSerializedState,
  isDevtoolsRoomSnapshot,
  isDevtoolsRoomSummary,
  serializeDevtoolsValue,
  type DevtoolsCommandResult,
  type DevtoolsSerializationOptions,
  type DevtoolsRoomSnapshot,
  type DevtoolsRoomSummary,
  type DevtoolsSerializedValue,
  type DevtoolsStateDiffEntry,
} from '..';

expectType<'__flockjs_devtools__'>(DEVTOOLS_BRIDGE_GLOBAL);
expectType<1>(DEVTOOLS_BRIDGE_VERSION);
expectType<100>(DEVTOOLS_MAX_EVENT_LOG_ENTRIES);

const serializationOptions: DevtoolsSerializationOptions = {
  maxArrayLength: 10,
  maxDepth: 3,
};
expectType<DevtoolsSerializationOptions>(serializationOptions);

const serialized = serializeDevtoolsValue(
  {
    nested: ['value', 1, null],
  },
  serializationOptions,
);
expectType<DevtoolsSerializedValue>(serialized);

const diff = diffSerializedState(
  {
    count: 1,
  },
  {
    count: 2,
  },
  {
    maxEntries: 10,
  },
);
expectType<DevtoolsStateDiffEntry[]>(diff);

const commandResult: DevtoolsCommandResult = {
  ok: true,
};
expectType<DevtoolsCommandResult>(commandResult);

const summaryLiteral = {
  hasSimulatedPeer: false,
  hasState: true,
  instanceId: 'instance-1',
  peerCount: 1,
  peerId: 'peer-1',
  roomId: 'room-id',
  status: 'connected',
  transport: 'webrtc',
};
const summaryCandidate: unknown = summaryLiteral;

if (isDevtoolsRoomSummary(summaryCandidate)) {
  expectType<DevtoolsRoomSummary>(summaryCandidate);
}

const snapshotCandidate: unknown = {
  ...summaryLiteral,
  bridgeVersion: 1,
  errors: [],
  events: [],
  peers: [],
  state: {
    available: true,
    diff: [],
    lastChangedBy: null,
    lastUpdatedAt: null,
    pending: false,
    queuedMutationCount: 0,
    reason: null,
    strategy: 'lww',
    value: null,
  },
};

if (isDevtoolsRoomSnapshot(snapshotCandidate)) {
  expectType<DevtoolsRoomSnapshot>(snapshotCandidate);
}
