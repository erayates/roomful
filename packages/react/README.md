# @roomful/react

React bindings for [Roomful](https://github.com/erayates/roomful) — a provider plus idiomatic hooks for real-time presence, cursors, shared state, awareness, events, viewport sync, laser pointer, locks, comments, and history.

> **Stable — v1.0**, plus the v1.5 collaboration primitives. The API is stable and ready for production.

## Install

```bash
npm install @roomful/core @roomful/react
```

## Usage

```tsx
import { RoomfulProvider, usePresence, useSharedState } from '@roomful/react';

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
    <button onClick={() => setCount(count + 1)}>
      {count} · {others.length} others here
    </button>
  );
}
```

Hooks: `useRoom`, `usePresence`, `useCursors`, `useSharedState`, `useAwareness`, `useEvent`, `usePeers`, `useConnectionStatus`. v1.5 collaboration primitives: `useViewport`, `useLocks` (plus `useLockState`), `usePointer`, `useComments`, `useHistory` — see the [reference docs](https://github.com/erayates/roomful/blob/main/docs/reference/adapters-react.md).

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference.

## License

MIT
