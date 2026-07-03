---
'@roomful/core': minor
---

Expose the comments storage adapter through the public API (EP-15 / S13): `useComments` now accepts
a `storageAdapter` option, so custom durable comments (Postgres, SQLite, or any backend) can be
configured without touching engine internals. Threads restore from the adapter on startup and save
after every change; it composes with the default in-memory backend. See
`docs/reference/comments-storage.md`.
