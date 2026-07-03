# Persistent activity storage

Audience: users.

The [activity feed](engines-activity.md) broadcasts entries to connected peers, but that feed is
in-memory and best-effort — a peer that joins later, or reloads, sees only entries recorded while it
was connected. To make the feed **durable** (surviving reconnects, reloads, and server restarts),
back the activity engine with a storage adapter.

## The contract

An `ActivityStorageAdapter` is a room-scoped pair of async methods:

```ts
interface ActivityStorageAdapter {
  load(): Promise<readonly ActivityEntry[]>;
  save(entries: readonly ActivityEntry[]): Promise<void>;
}
```

- **`load`** is called once on startup. Its entries are **merged** into the live feed —
  de-duplicated by id and re-sorted newest-first — so a peer joining a cold room sees the history
  without losing any entries that arrived over the broadcast channel while the load was in flight.
- **`save`** is called after every change with the full feed (newest first, already capped at the
  engine's `limit`). Persist it however you like: upsert by `entry.id`, or replace the room's rows
  wholesale.

Both are **best-effort** from the engine's point of view — a rejected `load` or `save` is swallowed,
so a storage outage never breaks the live feed.

## Wiring it up

Pass an adapter as `storageAdapter` to `useActivity`:

```ts
import { createMemoryActivityStorage, createRoom } from '@roomful/core';

const room = createRoom('doc-1', { relayUrl: 'wss://relay.example' });
const activity = room.useActivity({
  storageAdapter: createMemoryActivityStorage(),
});
```

Typically one authoritative peer (a server-side room, or a durable "host") owns the adapter; its feed
is restored on startup and saved after every change, so reloading clients that join it receive the
recorded history.

## Memory (reference)

`createMemoryActivityStorage()` is the reference adapter — handy in tests and as a template. It is
not durable across process restarts.

```ts
import { createMemoryActivityStorage } from '@roomful/core';

const storage = createMemoryActivityStorage();
```

## Postgres / SQLite (sketch)

Implement the two methods against your database — one row per entry, keyed by room and `entry.id`,
with the serialized entry stored as JSON:

```ts
import type { ActivityEntry, ActivityStorageAdapter } from '@roomful/core';

function createSqlActivityStorage(db: Db, roomId: string): ActivityStorageAdapter {
  return {
    async load(): Promise<readonly ActivityEntry[]> {
      const rows = await db.query(
        'select data from activity where room_id = $1 order by timestamp desc',
        [roomId],
      );
      return rows.map((row) => row.data);
    },
    async save(entries): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.query('delete from activity where room_id = $1', [roomId]);
        for (const entry of entries) {
          await tx.query(
            'insert into activity (room_id, id, timestamp, data) values ($1, $2, $3, $4)',
            [roomId, entry.id, entry.timestamp, entry],
          );
        }
      });
    },
  };
}
```

For high write volumes, upsert only the new entry instead of replacing the whole set, and debounce
`save`.

## Related docs

- [Activity engine](engines-activity.md)
- [Persistent comments storage](comments-storage.md)
- [Reference index](README.md)
