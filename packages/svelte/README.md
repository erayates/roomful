# @flockjs/svelte

Svelte bindings for [FlockJS](https://github.com/erayates/flockjs) — Svelte-native stores and actions for real-time collaboration.

## Install

```bash
npm install @flockjs/core @flockjs/svelte
```

## Usage

```svelte
<script>
  import { flock } from '@flockjs/svelte';

  const { presence, cursors, state } = flock('my-room', {
    presence: { name: 'Alice', color: '#4F46E5' },
  });

  const [count, setCount] = state.shared('count', 0);
</script>

<div use:cursors.mount>
  {#each $presence.others as user}
    <span>{user.name}</span>
  {/each}
  <button on:click={() => setCount($count + 1)}>{$count}</button>
</div>
```

`flock()` returns `{ presence, cursors, state, events, awareness }` as Svelte stores.

## Documentation

See the [FlockJS repository](https://github.com/erayates/flockjs) for the full API reference.

## License

MIT
