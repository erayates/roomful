# Solid Adapter (`@roomful/solid`)

Audience: users.

## Provider

```tsx
import { RoomfulProvider } from '@roomful/solid';

function App() {
  return (
    <RoomfulProvider
      roomId="my-room"
      transport="auto"
      presence={{ name: 'Alice', color: '#4F46E5' }}
      onConnect={() => console.log('connected')}
      onError={(error) => console.error(error)}
    >
      <Workspace />
    </RoomfulProvider>
  );
}
```

## Hooks

| Hook                        | Returns                                              | Purpose                        |
| --------------------------- | ---------------------------------------------------- | ------------------------------ |
| `useRoom()`                 | `Room`                                               | access low-level room instance |
| `usePresence()`             | `{ self, others, all, update, replace }`             | reactive participant data      |
| `useCursors(opts?)`         | `{ ref, cursors, mount, unmount }`                   | cursor tracking/rendering      |
| `useSharedState(key, opts)` | `[value, setValue]`                                  | synchronized state             |
| `useAwareness()`            | `{ others, set, setFocus, setSelection, setTyping }` | ephemeral peer context         |
| `useEvent(name, handler)`   | `emit` function                                      | subscribe and emit             |
| `usePeers()`                | `Accessor<Peer[]>`                                   | connected peers                |
| `useConnectionStatus()`     | `Accessor<RoomStatus>`                               | current room status            |

Reactive values are returned as Solid **accessors** — call them to read (`others()`, `cursors()`, `status()`). `usePresence()` exposes `self`, `others`, and `all` as accessors alongside the `update`/`replace` presence mutators. `useAwareness()` exposes the remote `others` accessor plus the `set`/`setFocus`/`setSelection`/`setTyping` mutators.

`useSharedState(key, opts)` intentionally mirrors React `useState`: it returns a `[value, setValue]` tuple where `value` is an accessor, and `setValue` accepts either the next value or an updater function. `opts` is required and forwards directly to `room.useState(...)`.

## Example

```tsx
import { useCursors, useSharedState } from '@roomful/solid';

function PollWidget() {
  const { ref, cursors } = useCursors<{ tool: 'pen' | 'eraser' }>();
  const [votes, setVotes] = useSharedState('poll-votes', {
    initialValue: { yes: 0, no: 0 },
    strategy: 'crdt',
  });

  return (
    <div ref={ref}>
      <p>
        Yes: {votes().yes} | No: {votes().no}
      </p>
      <p>Remote cursors: {cursors().length}</p>
      <button onClick={() => setVotes((v) => ({ ...v, yes: v.yes + 1 }))}>Vote Yes</button>
    </div>
  );
}
```

## Shared State Notes

- `useSharedState()` currently binds one shared-state engine per room. Every component in that room must use the same `key` and compatible `opts`.
- `opts` forwards directly to `room.useState(...)`, including `initialValue`, `strategy`, and `persist`.
- The setter reference is stable and returns the resolved value; it is a no-op when the next value is structurally equal to the current one.

## Integration Notes

- `RoomfulProvider` creates the room, connects on mount, and disconnects automatically on cleanup. It accepts `onConnect`, `onDisconnect`, and `onError` lifecycle callbacks in addition to the standard `RoomOptions`.
- `useRoom()` throws a `RoomfulError` when called outside a `RoomfulProvider`.
- `useCursors()` returns a callback `ref` you attach to an element (`<div ref={ref} />`); it mounts cursor tracking on attach and unmounts on detach. `mount(element)` / `unmount()` are also available for explicit control.
- `useEvent(name, handler)` subscribes to a channel and returns a stable `emit(payload)` function for the same channel.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Quickstart](../getting-started/quickstart.md)
- [Docs index](../README.md)
