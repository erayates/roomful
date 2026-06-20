# @cahoots/vue

Vue 3 bindings for [Cahoots](https://github.com/erayates/cahoots) — a plugin and composables that integrate real-time collaboration with Vue's reactivity system.

## Install

```bash
npm install @cahoots/core @cahoots/vue
```

## Usage

```ts
import { createApp } from 'vue';
import { CahootsPlugin } from '@cahoots/vue';
import App from './App.vue';

createApp(App)
  .use(CahootsPlugin, { roomId: 'my-room', presence: { name: 'Alice' } })
  .mount('#app');
```

```vue
<script setup>
import { usePresence, useSharedState } from '@cahoots/vue';

const { others } = usePresence();
const [count, setCount] = useSharedState('count', { initialValue: 0 });
</script>
```

Composables: `usePresence`, `useCursors`, `useSharedState`, `useAwareness`, `useEvent` (plus the `v-cahoots-cursors` directive).

## Documentation

See the [Cahoots repository](https://github.com/erayates/cahoots) for the full API reference.

## License

MIT
