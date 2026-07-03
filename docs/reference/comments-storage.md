# Persistent comments storage

Audience: users.

Comments sync live between connected peers over the CRDT channel, but that state is in-memory — it is
gone once every peer leaves. To make threads **durable** (surviving reconnects, reloads, and server
restarts), back the comments engine with a storage adapter.

## The contract

A `CommentsStorageAdapter` is a room-scoped pair of async methods:

```ts
interface CommentsStorageAdapter {
  load(): Promise<readonly CommentThread[]>;
  save(threads: readonly CommentThread[]): Promise<void>;
}
```

- **`load`** is called once on startup. When it returns threads and the room is otherwise empty, they
  are restored into the shared document, so a peer joining a cold room sees the history. If the room
  already has threads (synced from a peer or created locally), the live CRDT wins and `load` is
  ignored — it never clobbers newer state.
- **`save`** is called after every change with the full thread list. Persist it however you like:
  upsert by `thread.id`, or replace the room's rows wholesale.

Both are **best-effort** from the engine's point of view — a rejected `load` or `save` is swallowed,
so a storage outage never breaks the live, synced comments.

## Memory (reference)

`createMemoryCommentsStorage()` is the reference adapter — handy in tests and as a template. It is
not durable across process restarts.

```ts
import { createMemoryCommentsStorage } from '@roomful/core';

const storage = createMemoryCommentsStorage();
```

## Postgres / SQLite (sketch)

Implement the two methods against your database — one row per thread, keyed by room and `thread.id`,
with the serialized thread stored as JSON:

```ts
import type { CommentsStorageAdapter, CommentThread } from '@roomful/core';

function createSqlCommentsStorage(db: Db, roomId: string): CommentsStorageAdapter {
  return {
    async load(): Promise<readonly CommentThread[]> {
      const rows = await db.query(
        'select data from comments where room_id = $1 order by created_at',
        [roomId],
      );
      return rows.map((row) => row.data);
    },
    async save(threads): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.query('delete from comments where room_id = $1', [roomId]);
        for (const thread of threads) {
          await tx.query(
            'insert into comments (room_id, id, created_at, data) values ($1, $2, $3, $4)',
            [roomId, thread.id, thread.createdAt, thread],
          );
        }
      });
    },
  };
}
```

For high write volumes, upsert only changed threads instead of replacing the whole set, and debounce
`save`.

## Related docs

- [Cross-platform interop](interop.md)
- [Reference index](README.md)
