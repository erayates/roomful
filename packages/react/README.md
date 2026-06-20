# @cahoots/react

React bindings for [Cahoots](https://github.com/erayates/cahoots) — a provider plus idiomatic hooks for real-time presence, cursors, shared state, awareness, and events.

## Install

```bash
npm install @cahoots/core @cahoots/react
```

## Usage

```tsx
import { CahootsProvider, usePresence, useSharedState } from '@cahoots/react';

function App() {
  return (
    <CahootsProvider roomId="my-room" presence={{ name: 'Alice' }}>
      <Room />
    </CahootsProvider>
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

See the [Cahoots repository](https://github.com/erayates/cahoots) for the full API reference.

## License

MIT
