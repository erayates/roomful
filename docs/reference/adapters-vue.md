# Vue Adapter (`@roomful/vue`)

Audience: users.

## Plugin Setup

```ts
import { createApp } from 'vue';
import { RoomfulPlugin } from '@roomful/vue';
import App from './App.vue';

const app = createApp(App);

app.use(RoomfulPlugin, {
  roomId: 'my-room',
  presence: { name: 'Alice', color: '#4F46E5' },
  transport: 'auto',
});

app.mount('#app');
```

## Composables Example

```vue
<script setup lang="ts">
import { usePresence, useCursors, useSharedState, useEvent } from '@roomful/vue';

const { self, others } = usePresence();
const { ref: boardRef, cursors } = useCursors();

const [gameState, setGameState] = useSharedState('game', {
  initialValue: { phase: 'lobby', players: [] },
  strategy: 'lww',
});

const emitReaction = useEvent('reaction', (data, from) => {
  console.log('reaction from', from.name, data);
});
</script>

<template>
  <section>
    <p>{{ self.name }} sees {{ others.length }} collaborators</p>
    <div ref="boardRef">Remote cursors: {{ cursors.length }}</div>
  </section>
</template>
```

## Collaboration primitives (v1.5)

These composables follow the same Vue-ref conventions as the rest of the adapter (reactive state as readonly refs; `ref`/`mount`/`unmount` for DOM hosts):

- `useViewport(opts?)` — `{ ref, states, broadcast, stopBroadcast, present, stopPresenting, follow, unfollow }` to follow a peer's scroll/zoom. See [Viewport engine](engines-viewport.md).
- `useLocks()` — `{ locks, acquire, release, releaseAll, isLocked, getHolder }` for advisory locks over UI keys, with `useLockState(key)` returning a single key's `LockState | null` ref (the lock-on-focus pattern). See [Locking engine](engines-locks.md).
- `usePointer(opts?)` — `{ ref, beams, activate, deactivate, render }` for laser-pointer beams. See [Pointer engine](engines-pointer.md).
- `useComments(opts?)` — `{ threads, add, reply, resolve, reopen, getByElement, getOpen }` for anchored comment threads. See [Comments engine](engines-comments.md).
- `useActivity(opts?)` — `{ entries, record }` for the shared room activity feed (newest first). See [Activity engine](engines-activity.md).
- `useFieldPresence()` — `{ fields, setActiveField, getFieldPeers }` for who's active on which field. See [Field presence engine](engines-field-presence.md).
- `useHistory(opts?)` — `{ timeline, canUndo, canRedo, capture, transaction, undo, redo }` for undo/redo plus a shared activity timeline. See [History engine](engines-history.md).

## Integration Notes

- Designed for Vue 3 composable patterns and `setup()` usage in both Composition API and Options API components.
- All reactive state is exposed as Vue refs, so template auto-unwrapping works without `.value`.
- `useSharedState()` returns a tuple of `[stateRef, setState]`.
- `useEvent()` returns a stable `emit(payload)` function.
- `v-roomful-cursors` is registered globally by `RoomfulPlugin` as shorthand for cursor mounting:

```vue
<template>
  <div v-roomful-cursors="{ throttleMs: 16 }" />
</template>
```

- Plugin install owns the room lifecycle and disconnects the room on `app.unmount()`.

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
