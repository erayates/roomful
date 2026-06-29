# @roomful/vue

Vue 3 bindings for [Roomful](https://github.com/erayates/roomful) — a plugin and composables that integrate real-time collaboration (presence, cursors, shared state, awareness, events, viewport sync, laser pointer, locks, comments, and history) with Vue's reactivity system.

> **Stable — v1.5.** Realtime presence, cursors, and shared state, plus the collaboration primitives (`useViewport`, `useLocks`, `usePointer`, `useComments`, `useHistory`). The API is stable and ready for production.

## Install

```bash
npm install @roomful/core @roomful/vue
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

Composables: `usePresence`, `useCursors`, `useSharedState`, `useAwareness`, `useEvent`, `useConnectionStatus` (plus the `v-roomful-cursors` directive). v1.5 collaboration primitives: `useViewport`, `useLocks` (plus `useLockState`), `usePointer`, `useComments`, `useHistory` — see the [reference docs](https://github.com/erayates/roomful/blob/main/docs/reference/adapters-vue.md). `RoomfulPlugin` also accepts `onConnect`, `onDisconnect`, and `onError` lifecycle callbacks.

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference.

## License

MIT
