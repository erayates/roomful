# Changelog

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
