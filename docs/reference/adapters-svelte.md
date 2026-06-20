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

  const [votes, setVotes] = state.shared('votes', { yes: 0, no: 0 });
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

## Integration Notes

- `presence`, `cursors`, and `awareness` are Svelte-compatible stores.
- `state.shared(key, initialValue, options?)` returns a writable store plus a stable convenience setter.
- `events` exposes `emit`, `emitTo`, `on`, and `channel(name)` for store-based event consumption.
- `cursors.mount` is a Svelte action and `cursors.unmount()` is available for explicit teardown.
- In component setup, the adapter auto-connects on mount and auto-destroys on teardown.
- Outside component setup, use the returned `connect()`, `disconnect()`, and `destroy()` methods manually.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Quickstart](../getting-started/quickstart.md)
- [Docs index](../README.md)
