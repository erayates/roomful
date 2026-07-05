# Error catalog

Audience: users.

Roomful throws a typed [`RoomfulError`](core-api.md) with a `code` (`RoomfulErrorCode`), a
human-readable `message`, and a `recoverable` flag. This page is the catalog of those codes — what
each means and how to resolve it. The same data is available at runtime:

```ts
import { describeRoomfulError, ROOMFUL_ERROR_CATALOG } from '@roomful/core';

room.on('error', (error) => {
  const info = describeRoomfulError(error.code);
  console.warn(`${info.title}: ${info.description}\n→ ${info.remediation}`);
});
```

`ROOMFUL_ERROR_CATALOG` is a `Record<RoomfulErrorCode, ErrorCatalogEntry>`, so it always has an entry
for every code, and `describeRoomfulError(code)` returns `{ code, title, description, remediation,
recoverable }`.

## Codes

### `ROOM_FULL` — recoverable

The room reached its configured participant cap, so the join was rejected.

**Fix:** Raise the relay's max-room / max-peers capacity, gate joins in your app, or retry once a peer
leaves.

### `AUTH_FAILED`

The relay rejected the connection because its auth token was missing or invalid.

**Fix:** Ensure your relay-auth token factory returns a valid, unexpired token scoped to this room,
and that the relay's JWT secret matches the one that signed it.

### `NETWORK_ERROR` — recoverable

The transport connection failed to establish or dropped mid-session.

**Fix:** Check connectivity and the relay URL. The room auto-reconnects — watch
`getDiagnostics().transport.reconnectAttempt` and the room status to follow recovery.

### `ENCRYPTION_ERROR`

Peers disagree on the encryption mode, or the encryption key is misconfigured.

**Fix:** Make every peer use the same `encryption` option and a matching key.
`getDiagnostics().encryption.incompatiblePeerIds` lists the peers that disagree.

### `DECRYPTION_ERROR`

A received message could not be decrypted — almost always a key mismatch.

**Fix:** Confirm every peer shares the identical encryption key, and rotate keys consistently across
all clients at once. `getDiagnostics().encryption.decryptionErrorPeerIds` lists the affected peers.

### `INVALID_STATE`

An operation was called in an unsupported configuration or at the wrong time.

**Fix:** Check the operation's prerequisites (e.g. `useComments({ storage: 'rest' })` requires a
`restEndpoint`). The thrown message names the specific violation.

## Handling errors

- **`recoverable: true`** (`ROOM_FULL`, `NETWORK_ERROR`) — retrying, waiting, or letting auto-reconnect
  run may succeed. Don't treat these as fatal.
- **`recoverable: false`** — a configuration or auth problem the caller must fix before retrying.
- `RoomfulErrorCode` is **non-exhaustive** — new codes may be added in minor releases, so handle an
  unknown code with a default branch.

## Related docs

- [DevTools & debugging](devtools-debugging.md) — diagnostics snapshot and triage.
- [Core API](core-api.md) — `RoomfulError`, `RoomfulErrorCode`.
