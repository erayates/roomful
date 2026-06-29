# Locking Engine

Audience: users.

Locks provide a distributed advisory mutex over UI keys. Claim exclusive ownership of an arbitrary key (an editable cell, a draggable block) so peers can coordinate "only one editor at a time" interactions.

## Access

```ts
const locks = room.useLocks();
```

## Interface

```ts
interface LockEngine {
  acquire(key: string, options?: LockAcquireOptions): Promise<boolean>;
  release(key: string): void;
  releaseAll(): void;
  isLocked(key: string): boolean;
  getHolder(key: string): Peer | null;
  getAll(): LockState[];
  subscribe(key: string, callback: (state: LockState) => void): Unsubscribe;
  subscribeAll(callback: (states: LockState[]) => void): Unsubscribe;
}
```

Behavior notes:

- `acquire(key)` broadcasts a claim, waits a short bounded window for any conflicting earlier claim to surface, then resolves `true` when the local peer holds the lock or `false` when another peer holds it.
- With `options.timeout`, `acquire` keeps re-attempting until the lock frees (a holder releases or its TTL expires) or the timeout elapses.
- With `options.ttl`, the claim self-expires after the TTL so a crashed holder cannot hold the lock forever.
- `release(key)` releases a lock held by the local peer (a no-op otherwise); `releaseAll()` releases every lock the local peer holds.
- `isLocked(key)` reports whether the key has any non-expired holder; `getHolder(key)` returns that peer or `null`.
- `subscribe(key, cb)` fires immediately with the current state and again whenever the resolved holder, claim time, or expiry for `key` changes. `subscribeAll(cb)` fires with every held lock's state on any change.
- `getAll()` returns the resolved state of every known lock that currently has a holder.

## State Shape

```ts
interface LockState {
  key: string;
  holder: Peer | null; // null when the lock is free
  acquiredAt: number; // epoch ms, 0 when free
  expiresAt: number | null; // epoch ms TTL deadline, or null for no TTL
}
```

## Options

```ts
interface LockAcquireOptions {
  ttl?: number; // auto-release this many ms after acquiring
  timeout?: number; // wait up to this many ms for the lock to free
}
```

## Semantics

Locks are **advisory** and **ephemeral**, with **deterministic** resolution:

- **Advisory** — a lock is a coordination convention, not enforced mutual exclusion. Nothing prevents code that ignores the engine from mutating the same resource.
- **Ephemeral** — a claim auto-releases on the holder's disconnect, on TTL expiry, or on an explicit `release`. There is no persistence.
- **Deterministic** — there is no central lock authority. Each peer broadcasts its claims and releases on the event channel, and every peer resolves each key's holder with the same rule: the earliest non-expired, non-released claim wins, with the lower `peerId` breaking exact ties. Because all peers apply the same rule to the same claims, they converge on the same holder.
- **Eventually consistent** — during the propagation window of two near-simultaneous claims a peer may briefly see itself as holder before a conflicting earlier claim arrives, then converge. `acquire` waits a short bounded window to narrow this race, but a P2P/relay model cannot eliminate it. Treat the lock as coordination, not a correctness guarantee. There are no deadlocks by design.

## Example

```ts
const locks = room.useLocks();

const acquired = await locks.acquire('cell-A1', { ttl: 10000, timeout: 2000 });
if (acquired) {
  // The local peer owns 'cell-A1' for up to 10s (or until release).
  // ...edit the cell...
  locks.release('cell-A1');
}

const unsubscribe = locks.subscribe('cell-A1', (state) => {
  console.log('cell-A1 holder:', state.holder?.name ?? 'free');
});

unsubscribe();
```

## Adapter Usage

### React

```tsx
import { useLocks, useLockState } from '@roomful/react';

function Cell({ id }: { id: string }) {
  const { acquire, release } = useLocks();
  const lock = useLockState(id); // LockState | null

  return (
    <button
      disabled={lock?.holder != null}
      onClick={async () => {
        if (await acquire(id, { ttl: 10000 })) {
          // ...edit...
          release(id);
        }
      }}
    >
      {lock?.holder ? `Locked by ${lock.holder.name}` : 'Edit'}
    </button>
  );
}
```

`useLocks()` returns `{ locks, acquire, release, releaseAll, isLocked, getHolder }`; `useLockState(key)` subscribes to a single key and returns its `LockState | null` (the lock-on-focus pattern).

### Vue

```vue
<script setup lang="ts">
import { useLocks } from '@roomful/vue';

const { locks, acquire, release } = useLocks();
</script>

<template>
  <p>Held locks: {{ locks.length }}</p>
</template>
```

`locks` is a readonly ref of `LockState[]`.

### Svelte

```svelte
<script lang="ts">
  import { roomful } from '@roomful/svelte';

  const { locks, lockState } = roomful('my-room');
  const cell = lockState('cell-A1');
</script>

<p>Held locks: {$locks.length}</p>
<p>cell-A1: {$cell?.holder?.name ?? 'free'}</p>
```

`locks` is a readable store of `LockState[]` with `acquire`/`release`/`releaseAll`/`isLocked`/`getHolder` methods; `lockState(key)` returns a readable store of a single key's `LockState | null`.

### Solid

```tsx
import { useLocks, useLockState } from '@roomful/solid';

function Cell() {
  const { acquire, release } = useLocks();
  const lock = useLockState('cell-A1'); // Accessor<LockState | null>

  return <p>{lock()?.holder?.name ?? 'free'}</p>;
}
```

### Angular

```ts
import { Component } from '@angular/core';
import { injectLocks, injectLockState, provideRoomful } from '@roomful/angular';

@Component({
  selector: 'app-cell',
  standalone: true,
  providers: [provideRoomful('my-room')],
  template: `<p>{{ cell()?.holder?.name ?? 'free' }}</p>`,
})
export class CellComponent {
  protected readonly locks = injectLocks();
  protected readonly cell = injectLockState('cell-A1');
}
```

`injectLocks()` returns `locks` as a signal plus `acquire`/`release`/`releaseAll`/`isLocked`/`getHolder`; `injectLockState(key)` returns a `Signal<LockState | null>`.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Types](types.md)
- [Docs index](../README.md)
