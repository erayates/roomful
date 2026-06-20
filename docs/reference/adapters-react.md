# React Adapter (`@flockjs/react`)

Audience: users.

## Provider

```tsx
import { FlockProvider } from '@flockjs/react';

function App() {
  return (
    <FlockProvider
      roomId="my-room"
      transport="auto"
      presence={{ name: 'Alice', color: '#4F46E5' }}
      onConnect={() => console.log('connected')}
      onError={(error) => console.error(error)}
    >
      <Workspace />
    </FlockProvider>
  );
}
```

## Hooks

| Hook                        | Returns                                              | Purpose                        |
| --------------------------- | ---------------------------------------------------- | ------------------------------ |
| `useRoom()`                 | `Room`                                               | access low-level room instance |
| `usePresence()`             | `{ self, others, all }`                              | reactive participant data      |
| `useCursors()`              | `{ ref, cursors, mount, unmount }`                   | cursor tracking/rendering      |
| `useSharedState(key, opts)` | `[value, setValue]`                                  | synchronized state             |
| `useAwareness()`            | `{ set, setFocus, setSelection, setTyping, others }` | ephemeral peer context         |
| `useEvent(name, handler)`   | `emit` function                                      | subscribe and emit             |
| `usePeers()`                | `Peer[]`                                             | connected peers                |
| `useConnectionStatus()`     | `RoomStatus`                                         | current room status            |

`useSharedState(key, opts)` intentionally mirrors React `useState`: it returns a `[value, setValue]` tuple, and `setValue` accepts either the next value or an updater function.

## Example

```tsx
import { useCursors, useSharedState } from '@flockjs/react';

function PollWidget() {
  const { ref, cursors } = useCursors<{ tool: 'pen' | 'eraser' }>();
  const [votes, setVotes] = useSharedState('poll-votes', {
    initialValue: { yes: 0, no: 0 },
    strategy: 'crdt',
  });

  return (
    <div ref={ref}>
      <p>
        Yes: {votes.yes} | No: {votes.no}
      </p>
      <p>Remote cursors: {cursors.length}</p>
      <button onClick={() => setVotes((v) => ({ ...v, yes: v.yes + 1 }))}>Vote Yes</button>
    </div>
  );
}
```

## Shared State Notes

- `useSharedState()` currently binds one shared-state engine per room. Every component in that room must use the same `key`.
- `opts` forwards directly to `room.useState(...)`, including `initialValue`, `strategy`, and `persist`.
- The setter reference is stable across rerenders and room replacement.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Quickstart](../getting-started/quickstart.md)
- [Docs index](../README.md)
