import { isObject, readNumber, readString } from '../internal/guards';
import type { LockAcquireOptions, LockEngine, LockState, Peer } from '../types';

/**
 * How long {@link LockEngine.acquire} waits, by default, for conflicting earlier
 * claims to propagate before it resolves the holder. The window trades acquire
 * latency against the chance of a brief split decision under simultaneous claims
 * (see the consistency note on {@link LockEngine}).
 */
const DEFAULT_SETTLE_MS = 50;

/**
 * How often a pending {@link LockEngine.acquire} with a `timeout` re-checks
 * whether the lock has freed while it waits.
 */
const RETRY_POLL_MS = 20;

/**
 * A single peer's claim on a lock key, as broadcast on the event channel and
 * mirrored locally. `expiresAt` is the absolute epoch-ms TTL deadline, or `null`
 * for a claim that only releases explicitly or on disconnect.
 */
interface LockClaim {
  peerId: string;
  claimedAt: number;
  expiresAt: number | null;
}

/**
 * The wire shape broadcast when a peer claims a lock. The room stamps the sender
 * peer id onto the outbound frame, so the engine emits the peerless payload and
 * the room supplies `peerId` on inbound claims.
 */
export interface LockClaimFrame {
  key: string;
  claimedAt: number;
  expiresAt: number | null;
}

/**
 * The wire shape broadcast when a peer releases a lock it claimed.
 */
export interface LockReleaseFrame {
  key: string;
}

interface LockEngineContext {
  /**
   * Publishes a local lock claim to peers.
   */
  broadcastClaim(frame: LockClaimFrame): void;
  /**
   * Publishes a local lock release to peers.
   */
  broadcastRelease(frame: LockReleaseFrame): void;
  /**
   * Resolves a peer record by id so resolved holders carry presence. Returns a
   * minimal peer when the registry has no richer record yet (for example, the
   * local peer mid-handshake) and `null` when the peer is unknown.
   */
  getPeer(peerId: string): Peer | null;
  /**
   * The local peer id; the resolved holder of a key is compared against this to
   * answer {@link LockEngine.acquire}.
   */
  readonly selfPeerId: string;
  /**
   * Registers a callback fired when a remote peer broadcasts a lock claim. The
   * room intercepts the reserved internal event and forwards `(peerId, frame)`.
   */
  onRemoteClaim(handler: (peerId: string, frame: LockClaimFrame) => void): void;
  /**
   * Registers a callback fired when a remote peer broadcasts a lock release.
   */
  onRemoteRelease(handler: (peerId: string, frame: LockReleaseFrame) => void): void;
  /**
   * Registers a callback fired when a peer leaves the room, so the engine can
   * drop that peer's claims (ephemeral auto-release on disconnect).
   */
  onPeerLeave(handler: (peerId: string) => void): void;
}

/**
 * Parses an inbound lock-claim payload into a typed frame, or `null` when the
 * payload is malformed. `expiresAt` is optional and defaults to `null`.
 */
export function parseLockClaimFrame(payload: unknown): LockClaimFrame | null {
  if (!isObject(payload)) {
    return null;
  }

  const key = readString(payload, 'key');
  const claimedAt = readNumber(payload, 'claimedAt');
  if (key === undefined || claimedAt === undefined) {
    return null;
  }

  const rawExpiresAt = Reflect.get(payload, 'expiresAt');
  const expiresAt =
    typeof rawExpiresAt === 'number' && Number.isFinite(rawExpiresAt) ? rawExpiresAt : null;

  return {
    key,
    claimedAt,
    expiresAt,
  };
}

/**
 * Parses an inbound lock-release payload into a typed frame, or `null` when the
 * payload is malformed.
 */
export function parseLockReleaseFrame(payload: unknown): LockReleaseFrame | null {
  if (!isObject(payload)) {
    return null;
  }

  const key = readString(payload, 'key');
  if (key === undefined) {
    return null;
  }

  return { key };
}

function isClaimActive(claim: LockClaim, now: number): boolean {
  return claim.expiresAt === null || claim.expiresAt > now;
}

/**
 * The deterministic winner among the claims on a single key: the earliest
 * non-expired claim wins, with the lexicographically smaller `peerId` breaking
 * exact `claimedAt` ties. Every peer applies this same rule to the same claims,
 * so they converge on the same holder without a central authority.
 */
function resolveWinningClaim(claims: Iterable<LockClaim>, now: number): LockClaim | null {
  let winner: LockClaim | null = null;

  for (const claim of claims) {
    if (!isClaimActive(claim, now)) {
      continue;
    }

    if (winner === null) {
      winner = claim;
      continue;
    }

    if (
      claim.claimedAt < winner.claimedAt ||
      (claim.claimedAt === winner.claimedAt && claim.peerId < winner.peerId)
    ) {
      winner = claim;
    }
  }

  return winner;
}

function freeLockState(key: string): LockState {
  return {
    key,
    holder: null,
    acquiredAt: 0,
    expiresAt: null,
  };
}

function areLockStatesEqual(a: LockState, b: LockState): boolean {
  return (
    a.key === b.key &&
    (a.holder?.id ?? null) === (b.holder?.id ?? null) &&
    a.acquiredAt === b.acquiredAt &&
    a.expiresAt === b.expiresAt
  );
}

/**
 * Creates the distributed advisory lock engine. Claim bookkeeping, deterministic
 * holder resolution, TTL expiry, acquire/timeout waiting, and disconnect cleanup
 * all live here; the room supplies transport and peer-leave wiring via
 * {@link LockEngineContext}.
 *
 * The mutex is advisory and eventually consistent — see {@link LockEngine} for
 * the full consistency model and its limits.
 *
 * @param context - The room callbacks that publish, receive, and resolve locks.
 * @returns The lock engine bound to the room.
 */
export function createLockEngine(context: LockEngineContext): LockEngine {
  // key -> (peerId -> claim). Every peer's claims for a key live together so the
  // holder can be re-resolved deterministically whenever the set changes.
  const claimsByKey = new Map<string, Map<string, LockClaim>>();
  // The last state we notified per key, so we only fire subscribers on change.
  const lastNotifiedByKey = new Map<string, LockState>();
  const keySubscribers = new Map<string, Set<(state: LockState) => void>>();
  const allSubscribers = new Set<(states: LockState[]) => void>();
  // Pending TTL re-resolve timers, keyed so we can reschedule/cancel per key.
  const expiryTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();

  const now = (): number => {
    return Date.now();
  };

  const getClaims = (key: string): Map<string, LockClaim> => {
    const existing = claimsByKey.get(key);
    if (existing) {
      return existing;
    }

    const created = new Map<string, LockClaim>();
    claimsByKey.set(key, created);
    return created;
  };

  const resolveState = (key: string): LockState => {
    const claims = claimsByKey.get(key);
    if (!claims || claims.size === 0) {
      return freeLockState(key);
    }

    const winner = resolveWinningClaim(claims.values(), now());
    if (!winner) {
      return freeLockState(key);
    }

    return {
      key,
      holder: context.getPeer(winner.peerId),
      acquiredAt: winner.claimedAt,
      expiresAt: winner.expiresAt,
    };
  };

  const collectAllStates = (): LockState[] => {
    const states: LockState[] = [];
    for (const key of claimsByKey.keys()) {
      const state = resolveState(key);
      if (state.holder !== null) {
        states.push(state);
      }
    }

    return states;
  };

  const notifyAll = (): void => {
    if (allSubscribers.size === 0) {
      return;
    }

    const states = collectAllStates();
    for (const subscriber of allSubscribers) {
      subscriber(states);
    }
  };

  // Re-resolves a key, fires its key subscribers (and the all-subscribers) when
  // the resolved state changed, prunes empty/free keys, and schedules the next
  // TTL re-resolve so an expiring claim transitions the holder on time.
  const reconcileKey = (key: string): void => {
    const nextState = resolveState(key);
    const previousState = lastNotifiedByKey.get(key) ?? freeLockState(key);
    const changed = !areLockStatesEqual(previousState, nextState);

    pruneInactiveClaims(key);
    scheduleExpiry(key);

    if (!changed) {
      return;
    }

    lastNotifiedByKey.set(key, nextState);

    const subscribers = keySubscribers.get(key);
    if (subscribers) {
      for (const subscriber of subscribers) {
        subscriber(nextState);
      }
    }

    if (nextState.holder === null) {
      lastNotifiedByKey.delete(key);
    }

    notifyAll();
  };

  // Drops expired claims and, once a key has neither claims nor subscribers,
  // forgets it so the maps do not grow unbounded with churned keys.
  const pruneInactiveClaims = (key: string): void => {
    const claims = claimsByKey.get(key);
    if (!claims) {
      return;
    }

    const current = now();
    for (const [peerId, claim] of claims) {
      if (!isClaimActive(claim, current)) {
        claims.delete(peerId);
      }
    }

    if (claims.size === 0) {
      claimsByKey.delete(key);
      if (!keySubscribers.has(key)) {
        lastNotifiedByKey.delete(key);
      }
    }
  };

  const clearExpiryTimer = (key: string): void => {
    const timer = expiryTimers.get(key);
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
      expiryTimers.delete(key);
    }
  };

  // Schedules a single re-resolve at the soonest active TTL deadline for a key so
  // the holder transitions (and subscribers fire) the moment the winning claim
  // expires, without polling.
  const scheduleExpiry = (key: string): void => {
    clearExpiryTimer(key);

    const claims = claimsByKey.get(key);
    if (!claims || claims.size === 0) {
      return;
    }

    const current = now();
    let soonest: number | null = null;
    for (const claim of claims.values()) {
      if (claim.expiresAt === null) {
        continue;
      }

      if (soonest === null || claim.expiresAt < soonest) {
        soonest = claim.expiresAt;
      }
    }

    if (soonest === null) {
      return;
    }

    const delay = Math.max(0, soonest - current);
    const timer = globalThis.setTimeout(() => {
      expiryTimers.delete(key);
      reconcileKey(key);
    }, delay);
    expiryTimers.set(key, timer);
  };

  const applyClaim = (peerId: string, frame: LockClaimFrame): void => {
    const claims = getClaims(frame.key);
    claims.set(peerId, {
      peerId,
      claimedAt: frame.claimedAt,
      expiresAt: frame.expiresAt,
    });
    reconcileKey(frame.key);
  };

  const dropClaim = (peerId: string, key: string): void => {
    const claims = claimsByKey.get(key);
    if (!claims || !claims.has(peerId)) {
      return;
    }

    claims.delete(peerId);
    reconcileKey(key);
  };

  const dropAllClaimsBy = (peerId: string): void => {
    for (const key of Array.from(claimsByKey.keys())) {
      const claims = claimsByKey.get(key);
      if (claims?.has(peerId)) {
        claims.delete(peerId);
        reconcileKey(key);
      }
    }
  };

  context.onRemoteClaim((peerId, frame) => {
    applyClaim(peerId, frame);
  });

  context.onRemoteRelease((peerId, frame) => {
    dropClaim(peerId, frame.key);
  });

  context.onPeerLeave((peerId) => {
    dropAllClaimsBy(peerId);
  });

  const isSelfHolder = (key: string): boolean => {
    return resolveState(key).holder?.id === context.selfPeerId;
  };

  // Places (or refreshes) the local claim for a key and broadcasts it, then
  // returns the deadline so callers can honor an acquire timeout.
  const placeSelfClaim = (key: string, ttl: number | undefined): void => {
    const claimedAt = now();
    const expiresAt = typeof ttl === 'number' && ttl > 0 ? claimedAt + ttl : null;
    const frame: LockClaimFrame = { key, claimedAt, expiresAt };
    applyClaim(context.selfPeerId, frame);
    context.broadcastClaim(frame);
  };

  const removeSelfClaim = (key: string): void => {
    const claims = claimsByKey.get(key);
    if (!claims || !claims.has(context.selfPeerId)) {
      return;
    }

    claims.delete(context.selfPeerId);
    context.broadcastRelease({ key });
    reconcileKey(key);
  };

  const delay = (ms: number): Promise<void> => {
    return new Promise((resolve) => {
      globalThis.setTimeout(resolve, ms);
    });
  };

  // One acquire round: claim, wait the settle window for a conflicting earlier
  // claim to surface, then report whether we won. On a loss the local claim is
  // dropped so it does not block a later, legitimately-earliest waiter.
  const attemptAcquire = async (key: string, ttl: number | undefined): Promise<boolean> => {
    placeSelfClaim(key, ttl);
    await delay(DEFAULT_SETTLE_MS);

    if (isSelfHolder(key)) {
      return true;
    }

    removeSelfClaim(key);
    return false;
  };

  return {
    async acquire(key, options: LockAcquireOptions = {}) {
      const ttl = options.ttl;
      const timeout = options.timeout;

      if (typeof timeout !== 'number' || timeout <= 0) {
        return attemptAcquire(key, ttl);
      }

      const deadline = now() + timeout;
      for (;;) {
        if (await attemptAcquire(key, ttl)) {
          return true;
        }

        if (now() >= deadline) {
          return false;
        }

        // Wait for the lock to free (holder released or TTL expired) before the
        // next attempt, bounded so we re-check against the acquire deadline.
        await delay(RETRY_POLL_MS);
        if (now() >= deadline) {
          return false;
        }
      }
    },
    release(key) {
      removeSelfClaim(key);
    },
    releaseAll() {
      for (const key of Array.from(claimsByKey.keys())) {
        removeSelfClaim(key);
      }
    },
    isLocked(key) {
      return resolveState(key).holder !== null;
    },
    getHolder(key) {
      return resolveState(key).holder;
    },
    getAll() {
      return collectAllStates();
    },
    subscribe(key, callback) {
      const subscribers = keySubscribers.get(key) ?? new Set<(state: LockState) => void>();
      subscribers.add(callback);
      keySubscribers.set(key, subscribers);

      callback(resolveState(key));

      return () => {
        const current = keySubscribers.get(key);
        if (!current) {
          return;
        }

        current.delete(callback);
        if (current.size === 0) {
          keySubscribers.delete(key);
          if (!claimsByKey.has(key)) {
            lastNotifiedByKey.delete(key);
          }
        }
      };
    },
    subscribeAll(callback) {
      allSubscribers.add(callback);
      callback(collectAllStates());

      return () => {
        allSubscribers.delete(callback);
      };
    },
  };
}
