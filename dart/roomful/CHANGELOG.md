# Changelog

## 0.1.0-alpha.10

- Add `CursorsEngine.setPosition(x, y, {name, color, xAbsolute, yAbsolute, idle})`, which builds a
  relay-conformant `cursor:update` — `userId` is the local peer id, `xAbsolute` / `yAbsolute` default
  to the normalized `x` / `y`. The relay drops cursors missing any required field, so prefer this over
  the low-level `set`. Makes Dart cursors interoperate with the JS SDK through a real relay (EP-14).

## 0.1.0-alpha.9

- Fix `PresenceEngine` to emit relay-conformant presence: the broadcast `peer` now carries the
  required `joinedAt` and `lastSeen` timestamps, with `id` / `joinedAt` / `lastSeen` reserved so app
  presence can't override them. Without those fields `@roomful/relay` rejects the `presence:update`
  and it never reaches other peers — so Dart presence now interoperates with the JS SDK through a
  real relay (EP-14). Shared state and events already conformed.

## 0.1.0-alpha.8

- Add opt-in auto-reconnect to `RoomfulClient` (EP-11). Pass a `RoomfulReconnect` policy (max
  attempts + exponential backoff) and a dropped connection is re-established automatically: the
  transport re-opens, the client re-joins, the peer registry resyncs, and a new `reconnects` stream
  fires so engines re-announce — `PresenceEngine` re-broadcasts local presence. `WebSocketRelayTransport`
  is now reusable across connect / close cycles. Without a policy a drop leaves the client
  disconnected, as before. Unit-tested for reconnect, presence re-announce, and the no-policy path.

## 0.1.0-alpha.7

- Add `LocksEngine.acquireBlocking(key, {timeout})`: claims the lock like `acquire`, then resolves
  once the local peer is the resolved holder — immediately when the lock is free, or after an earlier
  holder releases or leaves — and returns `false`, retracting the local claim, if the timeout elapses
  first (EP-11). Unit-tested for the free, contended-then-released, and timeout paths.

## 0.1.0-alpha.6

- Wire the MessagePack codec into `RoomfulClient` send and receive (EP-11 / S06). A client
  constructed with `supportsBinary: true` and `msgpack` capabilities now negotiates a v2/msgpack
  uplink and exchanges **binary** relay `transport` frames — the whole `{type, message}` wrapper is
  msgpack-encoded, matching `@roomful/relay`'s wire format; control frames (`join` / `leave`) stay
  JSON. Inbound binary frames are decoded regardless. Adds the frame-level `encodeMsgpackFrame` /
  `decodeMsgpackFrame` helpers. Clients stay on JSON by default. The `roomful` Dart core is now
  feature-complete for `v2.1-alpha`.

## 0.1.0-alpha.5

- Add the MessagePack codec: `encodeMsgpackEnvelope` / `decodeMsgpackEnvelope` (via `msgpack_dart`),
  and un-skip the MessagePack conformance vectors so the Dart SDK now decodes the JS-produced msgpack
  envelopes too (EP-11 / S06). Wiring msgpack into the client's negotiated send over a binary transport
  is the remaining step; the `roomful` Dart core is otherwise feature-complete for `v2.1-alpha`.

## 0.1.0-alpha.4

- Add the remaining room primitives: `CursorsEngine` (live multiplayer cursors) and `LocksEngine`
  (advisory distributed locks — earliest claim wins, carried over the event channel with reserved
  `roomful:lock:*` names) (EP-11 / S06). The MessagePack codec is the remaining `v2.1-alpha` item.

## 0.1.0-alpha.3

- Add the room primitives on `RoomfulClient`: `EventEngine` (emit/on), `PresenceEngine` (live presence
  with peer-left cleanup and join re-announce), and `SharedStateEngine` (last-write-wins) (EP-11 / S06).
  Unit-tested against a fake transport; a `room_example` console demo shows presence/events/state.
  Cursors, locks, and the MessagePack codec follow.

## 0.1.0-alpha.2

- Add the relay control protocol (`buildRelayJoin` / `buildRelayTransport` / `parseRelayServerFrame`),
  the `RoomfulClient` room lifecycle (join, peer registry, broadcast/send, inbound message stream),
  and `WebSocketRelayTransport` (EP-11 / S05). The client is transport-injected and unit-tested against
  a fake transport. The MessagePack codec and the room-primitive APIs (presence, cursors, events,
  shared state) follow.

## 0.1.0-alpha.1

- Initial `v2.1-alpha` scaffold (EP-11): the Roomful Protocol v2 in Dart — `ProtocolCapabilities`,
  `negotiateSession`, `WireMessage`, and the JSON `encodeJsonEnvelope` / `decodeJsonEnvelope` codec
  (legacy v1 and modern v2 envelopes) — plus the `RoomfulTransport` interface. Validated against the
  shared `protocol-fixtures/` cross-SDK vectors. MessagePack codec and the room-client lifecycle
  follow in S05–S06.
