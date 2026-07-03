# Svelte Adapter (`@roomful/svelte`)

Audience: users.

## Store and Action Usage

```svelte
<script lang="ts">
  import { roomful } from '@roomful/svelte';

  const { cursors, presence, state, events, awareness } = roomful('my-room', {
    presence: { name: 'Alice', color: '#4F46E5' },
    transport: 'auto',
  });

  const [votes, setVotes] = state.shared('votes', { initialValue: { yes: 0, no: 0 } });
  const reactions = events.channel<{ emoji: string }>('reaction');
</script>

<div use:cursors.mount>
  {#each $presence.others as user}
    <p>{user.name} is online</p>
  {/each}

  {#each $cursors as cursor}
    <p>{cursor.name}</p>
  {/each}

  {#if $reactions}
    <p>{$reactions.from.name}: {$reactions.payload.emoji}</p>
  {/if}

  <button on:click={() => setVotes((v) => ({ ...v, yes: v.yes + 1 }))}>
    Vote Yes
  </button>

  <button on:click={() => reactions.emit({ emoji: '🔥' })}>
    React
  </button>
</div>
```

## Collaboration primitives (v1.5)

`roomful()` also returns these as stores. Each is a readable store of its remote/collaborative value with methods attached; `viewport.mount` and `pointer.mount` are Svelte actions like `cursors.mount`. Storage/limit options are passed on the `roomful(...)` factory (`comments`, `activity`, `history`).

- `viewport` — a store of remote `ViewportState[]` with `mount` (action), `unmount`, `broadcast`, `stopBroadcast`, `present`, `stopPresenting`, `follow`, `unfollow`. See [Viewport engine](engines-viewport.md).
- `locks` — a store of `LockState[]` with `acquire`/`release`/`releaseAll`/`isLocked`/`getHolder`; `lockState(key)` returns a store of a single key's `LockState | null`. See [Locking engine](engines-locks.md).
- `pointer` — a store of remote `PointerBeam[]` with `mount` (action), `unmount`, `activate`, `deactivate`, `render`. See [Pointer engine](engines-pointer.md).
- `comments` — a store of `CommentThread[]` with `add`/`reply`/`resolve`/`reopen`/`getByElement`/`getOpen`. See [Comments engine](engines-comments.md).
- `activity` — a store of the `ActivityEntry[]` feed (newest first) with `record`. See [Activity engine](engines-activity.md).
- `fieldPresence` — a store of the active `FieldPresenceState[]` (who's on which field) with `setActiveField` and `getFieldPeers`. See [Field presence engine](engines-field-presence.md).
- `history` — a store of the `TimelineEntry[]` timeline with nested `canUndo`/`canRedo` boolean stores and `capture`/`transaction`/`undo`/`redo`. See [History engine](engines-history.md).

## Integration Notes

- `presence`, `cursors`, and `awareness` are Svelte-compatible stores.
- `state.shared(key, options)` returns a writable store plus a stable convenience setter. Pass the initial value as `options.initialValue`.
- `events` exposes `emit`, `emitTo`, `on`, and `channel(name)` for store-based event consumption.
- `cursors.mount` is a Svelte action and `cursors.unmount()` is available for explicit teardown.
- In component setup, the adapter auto-connects on mount and auto-destroys on teardown.
- Outside component setup, use the returned `connect()`, `disconnect()`, and `destroy()` methods manually.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Viewport engine](engines-viewport.md)
- [Locking engine](engines-locks.md)
- [Pointer engine](engines-pointer.md)
- [Comments engine](engines-comments.md)
- [History engine](engines-history.md)
- [Quickstart](../getting-started/quickstart.md)
- [Docs index](../README.md)
