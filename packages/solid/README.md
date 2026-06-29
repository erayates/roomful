# @roomful/solid

SolidJS bindings for [Roomful](https://github.com/erayates/roomful) — a provider plus fine-grained primitives for real-time presence, cursors, shared state, awareness, events, viewport sync, laser pointer, locks, comments, and history.

> **Stable — v1.5.** Realtime presence, cursors, and shared state, plus the collaboration primitives (`useViewport`, `useLocks`, `usePointer`, `useComments`, `useHistory`). The API is stable and ready for production.

## Install

```bash
npm install @roomful/core @roomful/solid
```

## Usage

```tsx
import { RoomfulProvider, usePresence, useSharedState } from '@roomful/solid';

function App() {
  return (
    <RoomfulProvider roomId="my-room" presence={{ name: 'Alice' }}>
      <Room />
    </RoomfulProvider>
  );
}

function Room() {
  const { others } = usePresence();
  const [count, setCount] = useSharedState('count', { initialValue: 0 });
  return (
    <button onClick={() => setCount(count() + 1)}>
      {count()} · {others().length} others here
    </button>
  );
}
```

Primitives: `useRoom`, `usePresence`, `useCursors`, `useSharedState`, `useAwareness`, `useEvent`, `usePeers`, `useConnectionStatus`. v1.5 collaboration primitives: `useViewport`, `useLocks` (plus `useLockState`), `usePointer`, `useComments`, `useHistory` — see the [reference docs](https://github.com/erayates/roomful/blob/main/docs/reference/adapters-solid.md). Reactive values are returned as Solid accessors, and `RoomfulProvider` accepts `onConnect`, `onDisconnect`, and `onError` lifecycle callbacks.

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference.

## License

MIT
