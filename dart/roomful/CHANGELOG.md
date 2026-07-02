# Changelog

## 0.1.0-alpha.1

- Initial `v2.1-alpha` scaffold (EP-11): the Roomful Protocol v2 in Dart — `ProtocolCapabilities`,
  `negotiateSession`, `WireMessage`, and the JSON `encodeJsonEnvelope` / `decodeJsonEnvelope` codec
  (legacy v1 and modern v2 envelopes) — plus the `RoomfulTransport` interface. Validated against the
  shared `protocol-fixtures/` cross-SDK vectors. MessagePack codec and the room-client lifecycle
  follow in S05–S06.
