# State, Awareness, and Events

Audience: users.

Use each engine for the correct synchronization scope.

## Shared State

```ts
const state = room.useState({
  initialValue: { votes: {}, phase: 'lobby' },
  strategy: 'lww',
  persist: true,
});
```

```ts
interface StateEngine<T> {
  get(): T;
  set(value: T): void;
  patch(partial: Partial<T>): void;
  subscribe(cb: (value: T, meta: StateChangeMeta) => void): Unsubscribe;
  undo(): void;
  reset(): void;
}

interface StateChangeMeta {
  reason: 'set' | 'patch' | 'undo' | 'reset';
  changedBy: string;
  timestamp: number;
  pending: boolean;
  queuedMutationCount: number;
}
```

Conflict strategies:

- `lww`: latest write wins
- `crdt`: CRDT merge via Yjs
- `custom`: app-defined merge function

State behavior notes:

- LWW mutations apply locally immediately.
- After a room has been connected once, LWW mutations made while disconnected are queued in memory and replayed in order on reconnect.
- Replayed LWW mutations still pass through conflict resolution before they are sent again, so stale queued writes can be dropped.
- `pending: true` means the current local value includes unsaved queued mutations.
- `queuedMutationCount` exposes how many LWW mutations are still waiting to replay so UI can style unsaved state differently.

## Awareness

```ts
const awareness = room.useAwareness();
awareness.set({ typing: true, focus: 'comment-1' });
```

```ts
interface AwarenessEngine {
  set(value: Record<string, unknown>): void;
  setTyping(isTyping: boolean): void;
  setFocus(elementId: string | null): void;
  setSelection(selection: { from: number; to: number; elementId: string } | null): void;
  subscribe(cb: (peers: AwarenessState[]) => void): Unsubscribe;
  getAll(): AwarenessState[];
}
```

Behavior notes:

- `set()` merges into the local peer's current awareness object.
- `subscribe()` emits awareness for other peers only and calls back immediately with the current remote snapshot.
- `getAll()` returns the local peer plus remote peers that have published awareness.

## Events

```ts
const events = room.useEvents();
events.emit('reaction', { emoji: '🔥' });
```

```ts
interface EventEngine {
  emit<T = unknown>(name: string, payload: T): void;
  emitTo<T = unknown>(peerId: string, name: string, payload: T): void;
  on<T = unknown>(name: string, cb: (payload: T, from: Peer) => void): Unsubscribe;
  off<T = unknown>(name: string, cb: (payload: T, from: Peer) => void): void;
}
```

Behavior notes:

- `loopback` is `false` by default, so senders do not receive their own events unless `useEvents({ loopback: true })` is used.
- Events are transient and are not persisted for later subscribers or page reloads.
- Events emitted while disconnected are queued in memory for replay on reconnect.
- The offline event queue keeps only the newest `100` queued events.
- Event names are plain strings and payloads are untyped application data.

## Selection Matrix

| Need                       | Primitive   |
| -------------------------- | ----------- |
| Shared persisted app state | `state`     |
| Ephemeral user context     | `awareness` |
| Fire-and-forget signaling  | `events`    |

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [Advanced features](advanced.md)
- [Types](types.md)
- [Docs index](../README.md)
