---
'@roomful/core': minor
---

Add a `CommentsStorageAdapter` contract and a `createMemoryCommentsStorage` reference adapter for
durable comments (EP-15). When the comments engine is given a storage adapter, threads are restored
from it on startup — into an otherwise-empty room, so the live CRDT is never clobbered — and saved
after every change, so comments survive reconnects and reloads. Back the adapter with Postgres,
SQLite, or any store; see `docs/reference/comments-storage.md`. Persistence is best-effort and never
blocks the live, CRDT-synced comments.
