# Activity engine

Audience: users.

The activity engine is a shared, bounded, newest-first feed of room activity. Each `record` is
broadcast to every peer, so all peers converge on the same recent feed — useful for a "what's
happening" panel, an audit trail, or a notification surface.

## Access

```ts
const activity = room.useActivity(); // or room.useActivity({ limit: 200 })
```

## Interface

```ts
interface ActivityEngine {
  record(type: string, data?: unknown): ActivityEntry;
  getEntries(): ActivityEntry[]; // newest first
  subscribe(callback: (entries: ActivityEntry[]) => void): Unsubscribe;
}

interface ActivityEntry {
  id: string;
  type: string; // an app-defined label, e.g. 'comment:added'
  actor: Peer; // resolved from the broadcasting peer, with live presence
  data?: unknown; // optional structured payload
  timestamp: number; // epoch ms
}
```

- `record(type, data?)` appends an entry locally and broadcasts it; every peer appends it on
  receipt. Returns the created entry.
- `getEntries()` returns the feed newest first, de-duplicated by id and capped at `limit`
  (default `100`; the oldest are dropped first).
- `subscribe(cb)` fires immediately with the current feed, then on every change.

## Semantics

- **Shared** — entries ride the room's event channel (a reserved internal event), so no relay
  change is needed; peers already connected converge on the same feed.
- **Best-effort / not persistent** — entries live in memory and reach only peers connected when
  they are recorded, so a late joiner does not see earlier activity. Pair it with your own store
  (or the [comments storage adapter](comments-storage.md) pattern) if you need durability.
- **Bounded** — the feed retains at most `limit` entries.

## Example

The engine is content-agnostic — record whatever matters:

```ts
const activity = room.useActivity();

// when a comment is added
comments.subscribe(() => activity.record('comment:added'));

// when a record is locked
if (await locks.acquire(`record:${id}`)) {
  activity.record('record:locked', { id });
}

activity.subscribe((entries) => renderFeed(entries));
```

## Adapter usage

### React

```tsx
import { useActivity } from '@roomful/react';

function Feed(): JSX.Element {
  const { entries, record } = useActivity();
  return (
    <>
      <button onClick={() => record('note:added')}>Add note</button>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.actor.name ?? entry.actor.id}: {entry.type}
          </li>
        ))}
      </ul>
    </>
  );
}
```

`useActivity()` returns `{ entries, record }`; `entries` is the reactive feed, newest first.

## Related docs

- [Comments engine](engines-comments.md)
- [Locking engine](engines-locks.md)
- [Reference index](README.md)
