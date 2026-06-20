# @cahoots/svelte

Svelte bindings for [Cahoots](https://github.com/erayates/cahoots) — Svelte-native stores and actions for real-time collaboration.

## Install

```bash
npm install @cahoots/core @cahoots/svelte
```

## Usage

```svelte
<script>
  import { cahoots } from '@cahoots/svelte';

  const { presence, cursors, state } = cahoots('my-room', {
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

`cahoots()` returns `{ presence, cursors, state, events, awareness }` as Svelte stores.

## Documentation

See the [Cahoots repository](https://github.com/erayates/cahoots) for the full API reference.

## License

MIT
