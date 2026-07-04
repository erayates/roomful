---
'@roomful/core': minor
---

Fix durable comments losing replies and the resolved flag on reload, and export
`createLocalStorageCommentsStorage(roomId)`.

The `storage: 'indexeddb'` backend restored each persisted thread by re-adding its root text
(`commentsEngine.add({ anchor, text })`) — which minted a fresh id, dropped every reply, and reset
`resolved` to `false`. So a reload silently lost all replies and reopened resolved threads. The
backend now uses a Web Storage–backed `CommentsStorageAdapter` (the same one now exported as
`createLocalStorageCommentsStorage`), so threads restore in full through the engine's own hydrate
path. `useComments({ storageAdapter })` was already correct.
