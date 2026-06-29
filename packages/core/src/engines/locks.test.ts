import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';
import type { LockState, Peer } from '../types';
import {
  createLockEngine,
  type LockClaimFrame,
  type LockReleaseFrame,
  parseLockClaimFrame,
  parseLockReleaseFrame,
} from './locks';

interface MockLockContextHandle {
  claims: LockClaimFrame[];
  releases: LockReleaseFrame[];
  emitRemoteClaim(peerId: string, frame: LockClaimFrame): void;
  emitRemoteRelease(peerId: string, frame: LockReleaseFrame): void;
  emitPeerLeave(peerId: string): void;
  setPeerName(peerId: string, name: string): void;
  context: Parameters<typeof createLockEngine>[0];
}

function createMockLockContext(selfPeerId: string): MockLockContextHandle {
  const claims: LockClaimFrame[] = [];
  const releases: LockReleaseFrame[] = [];
  const claimHandlers = new Set<(peerId: string, frame: LockClaimFrame) => void>();
  const releaseHandlers = new Set<(peerId: string, frame: LockReleaseFrame) => void>();
  const peerLeaveHandlers = new Set<(peerId: string) => void>();
  const peerNames = new Map<string, string>();

  return {
    claims,
    releases,
    emitRemoteClaim(peerId, frame) {
      for (const handler of claimHandlers) {
        handler(peerId, frame);
      }
    },
    emitRemoteRelease(peerId, frame) {
      for (const handler of releaseHandlers) {
        handler(peerId, frame);
      }
    },
    emitPeerLeave(peerId) {
      for (const handler of peerLeaveHandlers) {
        handler(peerId);
      }
    },
    setPeerName(peerId, name) {
      peerNames.set(peerId, name);
    },
    context: {
      selfPeerId,
      broadcastClaim(frame) {
        claims.push(frame);
      },
      broadcastRelease(frame) {
        releases.push(frame);
      },
      getPeer(peerId): Peer | null {
        return {
          id: peerId,
          joinedAt: 0,
          lastSeen: 0,
          name: peerNames.get(peerId) ?? peerId,
        };
      },
      onRemoteClaim(handler) {
        claimHandlers.add(handler);
      },
      onRemoteRelease(handler) {
        releaseHandlers.add(handler);
      },
      onPeerLeave(handler) {
        peerLeaveHandlers.add(handler);
      },
    },
  };
}

interface TestPresence {
  name: string;
}

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('parseLockClaimFrame', () => {
  it('parses a well-formed claim and defaults a missing TTL to null', () => {
    expect(parseLockClaimFrame({ key: 'cell-1', claimedAt: 1_000 })).toEqual({
      key: 'cell-1',
      claimedAt: 1_000,
      expiresAt: null,
    });
    expect(parseLockClaimFrame({ key: 'cell-1', claimedAt: 1_000, expiresAt: 4_000 })).toEqual({
      key: 'cell-1',
      claimedAt: 1_000,
      expiresAt: 4_000,
    });
  });

  it('rejects malformed claim payloads', () => {
    expect(parseLockClaimFrame(null)).toBeNull();
    expect(parseLockClaimFrame({ claimedAt: 1 })).toBeNull();
    expect(parseLockClaimFrame({ key: 'cell-1' })).toBeNull();
  });
});

describe('parseLockReleaseFrame', () => {
  it('parses a release frame and rejects malformed payloads', () => {
    expect(parseLockReleaseFrame({ key: 'cell-1' })).toEqual({ key: 'cell-1' });
    expect(parseLockReleaseFrame({})).toBeNull();
    expect(parseLockReleaseFrame(42)).toBeNull();
  });
});

describe('createLockEngine', () => {
  it('acquires a free key and reports the local peer as holder', async () => {
    vi.useFakeTimers();
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);

    const acquired = engine.acquire('cell-1');
    await vi.advanceTimersByTimeAsync(50);

    expect(await acquired).toBe(true);
    expect(engine.isLocked('cell-1')).toBe(true);
    expect(engine.getHolder('cell-1')?.id).toBe('self');
    // Broadcast a claim so peers can resolve the same holder.
    expect(handle.claims).toHaveLength(1);
    expect(handle.claims[0]).toMatchObject({ key: 'cell-1', expiresAt: null });
  });

  it('returns false when another peer already holds the key with an earlier claim', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);

    // A remote peer claimed earlier than our attempt will be stamped.
    handle.emitRemoteClaim('peer-early', { key: 'cell-1', claimedAt: 1_000, expiresAt: null });

    const acquired = engine.acquire('cell-1');
    await vi.advanceTimersByTimeAsync(50);

    expect(await acquired).toBe(false);
    expect(engine.getHolder('cell-1')?.id).toBe('peer-early');
    // We must withdraw our losing claim so it cannot block a later waiter.
    expect(handle.releases.some((frame) => frame.key === 'cell-1')).toBe(true);
  });

  it('resolves the earliest claim deterministically, breaking ties by peerId', () => {
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);

    handle.emitRemoteClaim('peer-z', { key: 'k', claimedAt: 1_000, expiresAt: null });
    handle.emitRemoteClaim('peer-a', { key: 'k', claimedAt: 1_000, expiresAt: null });
    handle.emitRemoteClaim('peer-m', { key: 'k', claimedAt: 900, expiresAt: null });

    // Earliest claimedAt (900) wins outright.
    expect(engine.getHolder('k')?.id).toBe('peer-m');

    // Drop the earliest; the remaining tie at 1000 resolves to the lower peerId.
    handle.emitRemoteRelease('peer-m', { key: 'k' });
    expect(engine.getHolder('k')?.id).toBe('peer-a');
  });

  it('auto-expires a claim after its TTL and frees the lock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);

    const states: LockState[] = [];
    engine.subscribe('cell-1', (state) => {
      states.push(state);
    });

    handle.emitRemoteClaim('peer-a', { key: 'cell-1', claimedAt: 0, expiresAt: 1_000 });
    expect(engine.isLocked('cell-1')).toBe(true);
    expect(engine.getHolder('cell-1')?.id).toBe('peer-a');

    await vi.advanceTimersByTimeAsync(1_001);

    expect(engine.isLocked('cell-1')).toBe(false);
    expect(engine.getHolder('cell-1')).toBeNull();
    // The final emitted state for the key is the free state.
    expect(states.at(-1)).toMatchObject({ key: 'cell-1', holder: null, expiresAt: null });
  });

  it('drops a leaving peer locks (ephemeral auto-release on disconnect)', () => {
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);

    handle.emitRemoteClaim('peer-a', { key: 'a', claimedAt: 1, expiresAt: null });
    handle.emitRemoteClaim('peer-a', { key: 'b', claimedAt: 1, expiresAt: null });
    handle.emitRemoteClaim('peer-b', { key: 'a', claimedAt: 5, expiresAt: null });
    expect(engine.getHolder('a')?.id).toBe('peer-a');

    handle.emitPeerLeave('peer-a');

    // peer-a's claims are gone; peer-b inherits 'a', and 'b' is now free.
    expect(engine.getHolder('a')?.id).toBe('peer-b');
    expect(engine.isLocked('b')).toBe(false);
  });

  it('releaseAll withdraws every lock held by self', async () => {
    vi.useFakeTimers();
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);

    const first = engine.acquire('a');
    await vi.advanceTimersByTimeAsync(50);
    await first;
    const second = engine.acquire('b');
    await vi.advanceTimersByTimeAsync(50);
    await second;

    expect(engine.isLocked('a')).toBe(true);
    expect(engine.isLocked('b')).toBe(true);

    engine.releaseAll();

    expect(engine.isLocked('a')).toBe(false);
    expect(engine.isLocked('b')).toBe(false);
    expect(handle.releases.map((frame) => frame.key).sort()).toEqual(['a', 'b']);
  });

  it('subscribeAll reports only held locks and updates on change', async () => {
    vi.useFakeTimers();
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);
    const snapshots: LockState[][] = [];
    engine.subscribeAll((states) => {
      snapshots.push(states);
    });

    expect(snapshots.at(-1)).toEqual([]);

    handle.emitRemoteClaim('peer-a', { key: 'cell-1', claimedAt: 1, expiresAt: null });
    expect(snapshots.at(-1)).toEqual([expect.objectContaining({ key: 'cell-1', acquiredAt: 1 })]);

    handle.emitRemoteRelease('peer-a', { key: 'cell-1' });
    expect(snapshots.at(-1)).toEqual([]);
  });

  it('release is a no-op when the local peer does not hold the key', () => {
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);

    // A remote holds it; releasing locally must not drop the remote claim or
    // broadcast a release.
    handle.emitRemoteClaim('peer-a', { key: 'cell-1', claimedAt: 1, expiresAt: null });
    engine.release('cell-1');
    engine.release('never-touched');

    expect(engine.getHolder('cell-1')?.id).toBe('peer-a');
    expect(handle.releases).toHaveLength(0);
  });

  it('stops notifying a key subscriber after it unsubscribes', () => {
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);
    const seen: LockState[] = [];

    const unsubscribe = engine.subscribe('cell-1', (state) => {
      seen.push(state);
    });
    // Fires once immediately with the free state.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ key: 'cell-1', holder: null });

    unsubscribe();
    // A second unsubscribe is a no-op and must not throw.
    unsubscribe();

    handle.emitRemoteClaim('peer-a', { key: 'cell-1', claimedAt: 1, expiresAt: null });
    expect(seen).toHaveLength(1);
  });

  it('stops notifying subscribeAll after it unsubscribes', () => {
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);
    const snapshots: LockState[][] = [];

    const unsubscribe = engine.subscribeAll((states) => {
      snapshots.push(states);
    });
    expect(snapshots).toHaveLength(1);

    unsubscribe();

    handle.emitRemoteClaim('peer-a', { key: 'cell-1', claimedAt: 1, expiresAt: null });
    expect(snapshots).toHaveLength(1);
  });

  it('times out and resolves false when an earlier holder never releases', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const handle = createMockLockContext('self');
    const engine = createLockEngine(handle.context);

    handle.emitRemoteClaim('peer-early', { key: 'cell-1', claimedAt: 1, expiresAt: null });

    const acquired = engine.acquire('cell-1', { timeout: 200 });
    await vi.advanceTimersByTimeAsync(400);

    expect(await acquired).toBe(false);
    expect(engine.getHolder('cell-1')?.id).toBe('peer-early');
  });
});

describe('LockEngine room integration', () => {
  it('lets exactly one of two racing peers win and both converge on the holder', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('locks-race', { presence: { name: 'Alice' } });
    const roomB = harness.createRoom<TestPresence>('locks-race', { presence: { name: 'Bob' } });

    const locksA = roomA.useLocks();
    const locksB = roomB.useLocks();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const [wonA, wonB] = await Promise.all([locksA.acquire('cell-1'), locksB.acquire('cell-1')]);

    // Exactly one peer acquires the lock.
    expect(wonA).not.toBe(wonB);

    // Both peers converge on the same resolved holder.
    await harness.waitFor(() => {
      return locksA.getHolder('cell-1') !== null && locksB.getHolder('cell-1') !== null;
    });
    const holderViaA = locksA.getHolder('cell-1')?.id;
    const holderViaB = locksB.getHolder('cell-1')?.id;
    expect(holderViaA).toBe(holderViaB);

    const expectedHolder = wonA ? roomA.peerId : roomB.peerId;
    expect(holderViaA).toBe(expectedHolder);
  });

  it('returns false when acquiring a key another peer already holds', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('locks-held', { presence: { name: 'Alice' } });
    const roomB = harness.createRoom<TestPresence>('locks-held', { presence: { name: 'Bob' } });

    const locksA = roomA.useLocks();
    const locksB = roomB.useLocks();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    expect(await locksA.acquire('cell-1')).toBe(true);
    await harness.waitFor(() => locksB.isLocked('cell-1'));

    expect(await locksB.acquire('cell-1')).toBe(false);
    expect(locksB.getHolder('cell-1')?.id).toBe(roomA.peerId);
  });

  it('frees the lock on release so another peer can then acquire it', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('locks-release', {
      presence: { name: 'Alice' },
    });
    const roomB = harness.createRoom<TestPresence>('locks-release', { presence: { name: 'Bob' } });

    const locksA = roomA.useLocks();
    const locksB = roomB.useLocks();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    expect(await locksA.acquire('cell-1')).toBe(true);
    await harness.waitFor(() => locksB.isLocked('cell-1'));

    locksA.release('cell-1');
    await harness.waitFor(() => !locksB.isLocked('cell-1'));

    expect(await locksB.acquire('cell-1')).toBe(true);
    expect(locksB.getHolder('cell-1')?.id).toBe(roomB.peerId);
  });

  it('waits with a timeout and acquires once the holder releases', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('locks-timeout', {
      presence: { name: 'Alice' },
    });
    const roomB = harness.createRoom<TestPresence>('locks-timeout', { presence: { name: 'Bob' } });

    const locksA = roomA.useLocks();
    const locksB = roomB.useLocks();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    expect(await locksA.acquire('cell-1')).toBe(true);
    await harness.waitFor(() => locksB.isLocked('cell-1'));

    // B waits for the lock; A releases shortly after, so B should succeed.
    const pending = locksB.acquire('cell-1', { timeout: 2_000 });
    setTimeout(() => {
      locksA.release('cell-1');
    }, 60);

    expect(await pending).toBe(true);
    expect(locksB.getHolder('cell-1')?.id).toBe(roomB.peerId);
  });

  it('auto-releases a peer locks when it disconnects', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('locks-leave', { presence: { name: 'Alice' } });
    const roomB = harness.createRoom<TestPresence>('locks-leave', { presence: { name: 'Bob' } });

    const locksA = roomA.useLocks();
    const locksB = roomB.useLocks();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    expect(await locksA.acquire('cell-1')).toBe(true);
    await harness.waitFor(() => locksB.getHolder('cell-1')?.id === roomA.peerId);

    await roomA.disconnect();
    await harness.waitFor(() => !locksB.isLocked('cell-1'));

    expect(locksB.getAll()).toEqual([]);
    expect(await locksB.acquire('cell-1')).toBe(true);
  });
});
