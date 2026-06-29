import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';
import type { CommentThread } from '../types';

interface CommentPresence {
  name: string;
}

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
});

describe('CommentsEngine', () => {
  it('adds a thread that surfaces in getAll and subscribe with the right anchor and author', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom<CommentPresence>('comments-add', {
      presence: { name: 'Ada' },
    });
    const comments = room.useComments();

    const snapshots: CommentThread[][] = [];
    comments.subscribe((threads) => {
      snapshots.push(threads);
    });

    const created = await comments.add({
      anchor: { elementId: 'cell-1' },
      text: 'Needs a second look',
    });

    expect(created.anchor).toEqual({ elementId: 'cell-1' });
    expect(created.text).toBe('Needs a second look');
    expect(created.resolved).toBe(false);
    expect(created.replies).toEqual([]);
    expect(created.author.id).toBe(room.peerId);
    expect(created.author.name).toBe('Ada');
    expect(typeof created.createdAt).toBe('number');

    const all = comments.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(created.id);

    // The first snapshot is the immediate empty subscribe, the last reflects the add.
    expect(snapshots[0]).toEqual([]);
    expect(snapshots[snapshots.length - 1]).toHaveLength(1);
    expect(snapshots[snapshots.length - 1]?.[0]?.id).toBe(created.id);
  });

  it('supports all three anchor shapes', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('comments-anchors');
    const comments = room.useComments();

    const element = await comments.add({ anchor: { elementId: 'el' }, text: 'el' });
    const point = await comments.add({ anchor: { x: 12, y: 34 }, text: 'point' });
    const range = await comments.add({
      anchor: { from: 3, to: 9, elementId: 'doc' },
      text: 'range',
    });

    expect(element.anchor).toEqual({ elementId: 'el' });
    expect(point.anchor).toEqual({ x: 12, y: 34 });
    expect(range.anchor).toEqual({ from: 3, to: 9, elementId: 'doc' });
  });

  it('rejects an invalid anchor', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('comments-bad-anchor');
    const comments = room.useComments();

    await expect(
      comments.add({ anchor: {} as { elementId: string }, text: 'nope' }),
    ).rejects.toThrow(/anchor/i);
  });

  it('appends replies to a thread in order', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('comments-reply');
    const comments = room.useComments();

    const thread = await comments.add({ anchor: { elementId: 'x' }, text: 'root' });
    await comments.thread(thread.id).reply('first');
    const afterSecond = await comments.thread(thread.id).reply('second');

    expect(afterSecond.replies.map((reply) => reply.text)).toEqual(['first', 'second']);
    expect(afterSecond.replies[0]?.author.id).toBe(room.peerId);
    expect(afterSecond.replies[0]?.id).not.toBe(afterSecond.replies[1]?.id);

    const reread = comments.getAll().find((entry) => entry.id === thread.id);
    expect(reread?.replies).toHaveLength(2);
  });

  it('toggles resolved via resolve and reopen', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('comments-resolve');
    const comments = room.useComments();

    const thread = await comments.add({ anchor: { elementId: 'x' }, text: 'root' });
    expect(thread.resolved).toBe(false);

    const resolved = await comments.thread(thread.id).resolve();
    expect(resolved.resolved).toBe(true);

    const reopened = await comments.thread(thread.id).reopen();
    expect(reopened.resolved).toBe(false);
  });

  it('filters with getByElement and getOpen', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('comments-filter');
    const comments = room.useComments();

    const onA = await comments.add({ anchor: { elementId: 'a' }, text: 'on a' });
    const rangeOnA = await comments.add({
      anchor: { from: 0, to: 2, elementId: 'a' },
      text: 'range on a',
    });
    await comments.add({ anchor: { elementId: 'b' }, text: 'on b' });
    await comments.add({ anchor: { x: 1, y: 2 }, text: 'floating' });

    const byElementA = comments.getByElement('a');
    expect(byElementA.map((thread) => thread.id).sort()).toEqual([onA.id, rangeOnA.id].sort());

    // Resolve one thread, then only the rest stay open.
    await comments.thread(onA.id).resolve();
    const open = comments.getOpen();
    expect(open.some((thread) => thread.id === onA.id)).toBe(false);
    expect(open).toHaveLength(3);
  });

  it('syncs a comment and reply from one peer to another across the transport', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<CommentPresence>('comments-sync', {
      presence: { name: 'Author' },
    });
    const roomB = harness.createRoom<CommentPresence>('comments-sync', {
      presence: { name: 'Reader' },
    });

    const commentsA = roomA.useComments();
    const commentsB = roomB.useComments();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const created = await commentsA.add({
      anchor: { elementId: 'shared-cell' },
      text: 'Please review',
    });

    // Peer B sees peer A's thread, with peer A recorded as the author.
    await harness.waitFor(() => commentsB.getAll().length === 1);
    const seenByB = commentsB.getAll()[0];
    expect(seenByB?.id).toBe(created.id);
    expect(seenByB?.text).toBe('Please review');
    expect(seenByB?.anchor).toEqual({ elementId: 'shared-cell' });
    expect(seenByB?.author.id).toBe(roomA.peerId);
    expect(seenByB?.author.name).toBe('Author');

    // Peer A replies; peer B sees the reply appended.
    await commentsA.thread(created.id).reply('On it');
    await harness.waitFor(() => {
      return (commentsB.getAll()[0]?.replies.length ?? 0) === 1;
    });
    expect(commentsB.getAll()[0]?.replies[0]?.text).toBe('On it');

    // Peer B resolves; peer A converges on resolved.
    await commentsB.thread(created.id).resolve();
    await harness.waitFor(() => commentsA.getAll()[0]?.resolved === true);
    expect(commentsA.getOpen()).toHaveLength(0);
  });

  it('hydrates a late-joining peer with existing threads', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom('comments-late');
    const commentsA = roomA.useComments();
    await roomA.connect();

    const created = await commentsA.add({ anchor: { x: 5, y: 6 }, text: 'before join' });

    const roomB = harness.createRoom('comments-late');
    const commentsB = roomB.useComments();
    await roomB.connect();

    await harness.waitFor(() => commentsB.getAll().length === 1);
    expect(commentsB.getAll()[0]?.id).toBe(created.id);
    expect(commentsB.getAll()[0]?.anchor).toEqual({ x: 5, y: 6 });
  });
});
