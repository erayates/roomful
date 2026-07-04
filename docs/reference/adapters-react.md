# React Adapter (`@roomful/react`)

Audience: users.

## Provider

```tsx
import { RoomfulProvider } from '@roomful/react';

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
| `usePresence()`             | `{ self, others, all }`                              | reactive participant data      |
| `useCursors()`              | `{ ref, cursors, mount, unmount }`                   | cursor tracking/rendering      |
| `useSharedState(key, opts)` | `[value, setValue]`                                  | synchronized state             |
| `useAwareness()`            | `{ set, setFocus, setSelection, setTyping, others }` | ephemeral peer context         |
| `useEvent(name, handler)`   | `emit` function                                      | subscribe and emit             |
| `usePeers()`                | `Peer[]`                                             | connected peers                |
| `useConnectionStatus()`     | `RoomStatus`                                         | current room status            |

### Collaboration primitives (v1.5)

| Hook                          | Returns                                                                                | Purpose                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `useViewport(opts?)`          | `{ ref, states, broadcast, stopBroadcast, present, stopPresenting, follow, unfollow }` | follow a peer's scroll/zoom ([viewport](engines-viewport.md))                       |
| `useLocks()`                  | `{ locks, acquire, release, releaseAll, isLocked, getHolder }`                         | advisory locks over UI keys ([locks](engines-locks.md))                             |
| `useLockState(key)`           | `LockState \| null`                                                                    | one key's holder, for lock-on-focus ([locks](engines-locks.md))                     |
| `usePointer(opts?)`           | `{ ref, beams, activate, deactivate, render }`                                         | laser pointer beams ([pointer](engines-pointer.md))                                 |
| `useComments(opts?)`          | `{ threads, add, reply, resolve, reopen, getByElement, getOpen }`                      | anchored comment threads ([comments](engines-comments.md))                          |
| `useActivity(opts?)`          | `{ entries, record }`                                                                  | room activity feed ([activity](engines-activity.md))                                |
| `useFieldPresence()`          | `{ fields, setActiveField, getFieldPeers }`                                            | who's on which field ([field presence](engines-field-presence.md))                  |
| `useAgentApprovals(opts?)`    | `{ proposals, pending, approve, reject, propose }`                                     | human-in-the-loop agent approvals ([agent approvals](engines-agent-approvals.md))   |
| `useSessionSummarizer(opts?)` | `SessionSummary`                                                                       | session rollup from the activity feed ([session summarizer](session-summarizer.md)) |
| `useHistory(opts?)`           | `{ timeline, canUndo, canRedo, capture, transaction, undo, redo }`                     | undo/redo plus shared timeline ([history](engines-history.md))                      |

`useSharedState(key, opts)` intentionally mirrors React `useState`: it returns a `[value, setValue]` tuple, and `setValue` accepts either the next value or an updater function.

## Example

```tsx
import { useCursors, useSharedState } from '@roomful/react';

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
- [Viewport engine](engines-viewport.md)
- [Locking engine](engines-locks.md)
- [Pointer engine](engines-pointer.md)
- [Comments engine](engines-comments.md)
- [History engine](engines-history.md)
- [Quickstart](../getting-started/quickstart.md)
- [Docs index](../README.md)
