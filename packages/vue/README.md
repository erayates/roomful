# @flockjs/vue

Vue 3 bindings for [FlockJS](https://github.com/erayates/flockjs) — a plugin and composables that integrate real-time collaboration with Vue's reactivity system.

## Install

```bash
npm install @flockjs/core @flockjs/vue
```

## Usage

```ts
import { createApp } from 'vue';
import { FlockPlugin } from '@flockjs/vue';
import App from './App.vue';

createApp(App)
  .use(FlockPlugin, { roomId: 'my-room', presence: { name: 'Alice' } })
  .mount('#app');
```

```vue
<script setup>
import { usePresence, useSharedState } from '@flockjs/vue';

const { others } = usePresence();
const [count, setCount] = useSharedState('count', { initialValue: 0 });
</script>
```

Composables: `usePresence`, `useCursors`, `useSharedState`, `useAwareness`, `useEvent` (plus the `v-flock-cursors` directive).

## Documentation

See the [FlockJS repository](https://github.com/erayates/flockjs) for the full API reference.

## License

MIT
