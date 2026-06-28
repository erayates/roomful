# @roomful/vue

Vue 3 bindings for [Roomful](https://github.com/erayates/roomful) — a plugin and composables that integrate real-time collaboration with Vue's reactivity system.

> **Public beta** — install with the `@beta` tag; the API is stable but may still change before 1.0.

## Install

```bash
npm install @roomful/core@beta @roomful/vue@beta
```

## Usage

```ts
import { createApp } from 'vue';
import { RoomfulPlugin } from '@roomful/vue';
import App from './App.vue';

createApp(App)
  .use(RoomfulPlugin, { roomId: 'my-room', presence: { name: 'Alice' } })
  .mount('#app');
```

```vue
<script setup>
import { usePresence, useSharedState } from '@roomful/vue';

const { others } = usePresence();
const [count, setCount] = useSharedState('count', { initialValue: 0 });
</script>
```

Composables: `usePresence`, `useCursors`, `useSharedState`, `useAwareness`, `useEvent`, `useConnectionStatus` (plus the `v-roomful-cursors` directive). `RoomfulPlugin` also accepts `onConnect`, `onDisconnect`, and `onError` lifecycle callbacks.

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference.

## License

MIT
