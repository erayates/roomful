import { expectType } from 'tsd';

import {
  diffSerializedState,
  isDevtoolsRoomSnapshot,
  isDevtoolsRoomSummary,
  serializeDevtoolsValue,
  type DevtoolsRoomSnapshot,
  type DevtoolsRoomSummary,
  type DevtoolsSerializedValue,
  type DevtoolsStateDiffEntry,
} from '..';

const serialized = serializeDevtoolsValue({
  nested: ['value', 1, null],
});
expectType<DevtoolsSerializedValue>(serialized);

const diff = diffSerializedState(
  {
    count: 1,
  },
  {
    count: 2,
  },
);
expectType<DevtoolsStateDiffEntry[]>(diff);

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
