# @flockjs/react

React bindings for [FlockJS](https://github.com/erayates/flockjs) — a provider plus idiomatic hooks for real-time presence, cursors, shared state, awareness, and events.

## Install

```bash
npm install @flockjs/core @flockjs/react
```

## Usage

```tsx
import { FlockProvider, usePresence, useSharedState } from '@flockjs/react';

function App() {
  return (
    <FlockProvider roomId="my-room" presence={{ name: 'Alice' }}>
      <Room />
    </FlockProvider>
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

See the [FlockJS repository](https://github.com/erayates/flockjs) for the full API reference.

## License

MIT
