# @roomful/react

React bindings for [Roomful](https://github.com/erayates/roomful) — a provider plus idiomatic hooks for real-time presence, cursors, shared state, awareness, and events.

> **Public beta** — install with the `@beta` tag; the API is stable but may still change before 1.0.

## Install

```bash
npm install @roomful/core@beta @roomful/react@beta
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

Hooks: `useRoom`, `usePresence`, `useCursors`, `useSharedState`, `useAwareness`, `useEvent`, `usePeers`, `useConnectionStatus`.

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference.

## License

MIT
