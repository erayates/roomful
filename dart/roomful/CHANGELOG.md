# Changelog

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
