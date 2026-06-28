# @roomful/svelte

Svelte bindings for [Roomful](https://github.com/erayates/roomful) — Svelte-native stores and actions for real-time collaboration.

> **Stable — v1.0.** The API is stable and ready for production.

## Install

```bash
npm install @roomful/core @roomful/svelte
```

## Usage

```svelte
<script>
  import { roomful } from '@roomful/svelte';

  const { presence, cursors, state } = roomful('my-room', {
    presence: { name: 'Alice', color: '#4F46E5' },
  });

  const [count, setCount] = state.shared('count', { initialValue: 0 });
</script>

<div use:cursors.mount>
  {#each $presence.others as user}
    <span>{user.name}</span>
  {/each}
  <button on:click={() => setCount($count + 1)}>{$count}</button>
</div>
```

`roomful()` returns `{ presence, cursors, state, events, awareness, status }` as Svelte stores. The `status` store exposes the current `RoomStatus`, and `roomful()` accepts `onConnect`, `onDisconnect`, and `onError` lifecycle callbacks.

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference.

## License

MIT
