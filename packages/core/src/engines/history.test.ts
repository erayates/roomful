import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';
import type { TimelineEntry } from '../types';

interface HistoryPresence {
  name: string;
}

interface BoardState {
  shapes: string[];
}

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
});

describe('HistoryEngine', () => {
  it('captures a timeline entry with the local peer as author', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom<HistoryPresence>('history-capture', {
      presence: { name: 'Ada' },
    });
    const history = room.useHistory();

    const snapshots: TimelineEntry[][] = [];
    history.subscribe((timeline) => {
      snapshots.push(timeline);
    });

    history.capture('draw', 'Drew a circle');

    const timeline = history.timeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.action).toBe('draw');
    expect(timeline[0]?.description).toBe('Drew a circle');
    expect(timeline[0]?.peerId).toBe(room.peerId);
    expect(timeline[0]?.peerName).toBe('Ada');
    expect(typeof timeline[0]?.timestamp).toBe('number');

    // The first snapshot is the immediate empty subscribe, the last reflects the capture.
    expect(snapshots[0]).toEqual([]);
    expect(snapshots[snapshots.length - 1]).toHaveLength(1);
  });

  it('defaults the entry description to the action when no string payload is given', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('history-description');
    const history = room.useHistory();

    history.capture('move');
    history.capture('resize', { width: 4 });

    const timeline = history.timeline();
    expect(timeline[0]?.description).toBe('move');
    expect(timeline[1]?.description).toBe('resize');
  });

  it('undoes and redoes a transaction that mutates the shared CRDT document', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('history-undo');
    const state = room.useState<BoardState>({
      initialValue: { shapes: [] },
      strategy: 'crdt',
    });
    const history = room.useHistory();

    expect(history.canUndo()).toBe(false);

    history.transaction('add-shape', () => {
      state.set({ shapes: ['circle'] });
    });

    expect(state.get().shapes).toEqual(['circle']);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // The transaction recorded one timeline entry alongside the undoable change.
    expect(history.timeline()).toHaveLength(1);
    expect(history.timeline()[0]?.action).toBe('add-shape');

    await history.undo();
    expect(state.get().shapes).toEqual([]);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    await history.redo();
    expect(state.get().shapes).toEqual(['circle']);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('tracks the undo and redo stacks across multiple transactions', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('history-stacks');
    const state = room.useState<BoardState>({
      initialValue: { shapes: [] },
      strategy: 'crdt',
    });
    const history = room.useHistory({ captureInterval: 0 });

    history.transaction('add-a', () => {
      state.set({ shapes: ['a'] });
    });
    history.transaction('add-b', () => {
      state.set({ shapes: ['a', 'b'] });
    });

    expect(state.get().shapes).toEqual(['a', 'b']);

    await history.undo();
    expect(state.get().shapes).toEqual(['a']);

    await history.undo();
    expect(state.get().shapes).toEqual([]);
    expect(history.canUndo()).toBe(false);

    await history.redo();
    expect(state.get().shapes).toEqual(['a']);
    expect(history.canRedo()).toBe(true);
  });

  it('syncs the timeline across peers like the comments engine', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<HistoryPresence>('history-sync', {
      presence: { name: 'Author' },
    });
    const roomB = harness.createRoom<HistoryPresence>('history-sync', {
      presence: { name: 'Reader' },
    });

    const historyA = roomA.useHistory();
    const historyB = roomB.useHistory();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    historyA.capture('draw', 'Drew a rectangle');

    // Peer B sees peer A's entry, attributed to peer A.
    await harness.waitFor(() => historyB.timeline().length === 1);
    const seenByB = historyB.timeline()[0];
    expect(seenByB?.action).toBe('draw');
    expect(seenByB?.description).toBe('Drew a rectangle');
    expect(seenByB?.peerId).toBe(roomA.peerId);
    expect(seenByB?.peerName).toBe('Author');

    // Peer B captures too; the shared timeline converges to both entries on both peers.
    historyB.capture('erase');
    await harness.waitFor(
      () => historyA.timeline().length === 2 && historyB.timeline().length === 2,
    );
    expect(historyA.timeline().map((entry) => entry.action)).toEqual(['draw', 'erase']);
    expect(historyB.timeline().map((entry) => entry.peerId)).toEqual([roomA.peerId, roomB.peerId]);
  });

  it('keeps undo per-peer: peer A undo does not revert peer B concurrent change', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom('history-conflict-free');
    const roomB = harness.createRoom('history-conflict-free');

    // A shared CRDT map both peers edit. Each peer writes a DISTINCT key, so the
    // edits are structurally concurrent and non-conflicting at the CRDT level —
    // exactly the case Y.UndoManager origin-scoping is built to protect. We
    // mutate the shared doc directly (the data model behind a crdt useState),
    // which is what a real app does inside transaction(fn).
    const docA = roomA.getYDoc();
    const docB = roomB.getYDoc();
    const mapA = docA.getMap<string>('shared-board');
    const mapB = docB.getMap<string>('shared-board');

    const historyA = roomA.useHistory();
    roomB.useHistory();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    // Peer A makes an undoable change to its own key.
    historyA.transaction('set-a', () => {
      mapA.set('a', 'from-A');
    });
    await harness.waitFor(() => mapB.get('a') === 'from-A');

    // Peer B makes its own concurrent change to a different key (not wrapped in
    // A's history, so it must be invisible to A's UndoManager).
    docB.transact(() => {
      mapB.set('b', 'from-B');
    });
    await harness.waitFor(() => mapA.get('b') === 'from-B');

    // Peer A undoes ONLY its own change. Peer B's concurrent value must survive.
    await historyA.undo();

    await harness.waitFor(() => mapA.get('a') === undefined);
    expect(mapA.get('a')).toBeUndefined();
    expect(mapA.get('b')).toBe('from-B');

    await harness.waitFor(() => mapB.get('a') === undefined);
    expect(mapB.get('a')).toBeUndefined();
    expect(mapB.get('b')).toBe('from-B');
  });

  it('drops malformed remote timeline entries at read time', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('history-malformed');
    const history = room.useHistory();

    history.capture('valid');

    // Simulate a malformed remote write straight onto the shared timeline root.
    const doc = room.getYDoc();
    const timelineRoot = doc.getArray('__roomful_history__');
    doc.transact(() => {
      timelineRoot.push([{ action: 'missing-fields' }]);
    });

    const timeline = history.timeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.action).toBe('valid');
  });

  it('caps the per-peer timeline at maxEntries, dropping oldest first', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('history-cap');
    const history = room.useHistory({ maxEntries: 3 });

    for (let index = 0; index < 5; index += 1) {
      history.capture(`action-${index}`);
    }

    const timeline = history.timeline();
    expect(timeline).toHaveLength(3);
    expect(timeline.map((entry) => entry.action)).toEqual(['action-2', 'action-3', 'action-4']);
  });
});
