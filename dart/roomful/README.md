# roomful (Dart) — alpha

Open-source, self-hostable realtime collaboration for **Dart and Flutter** apps — the pure-Dart
core client. The Flutter widgets/overlays layer is the separate `roomful_flutter` package.

> **Status: `v2.1-alpha` scaffold (EP-11).** This package currently implements the
> [Roomful Protocol v2](../../rfcs/0001-protocol-v2.md) — capabilities, session negotiation, the
> versioned transport envelope, and the JSON codec — plus the transport interface. The room-client
> lifecycle (connect, presence, cursors, events, shared state) and the WebSocket relay transport
> land in following milestones (S05–S06). Not yet published to pub.dev.

## What works today

- `ProtocolCapabilities` + `negotiateSession(...)` — the exact v1..v2 / json↔msgpack negotiation from `@roomful/core`.
- `WireMessage`, `encodeJsonEnvelope`, `decodeJsonEnvelope` — the legacy v1 and modern v2 JSON envelopes.
- `RoomfulTransport` — the transport interface the room client will drive.

Run the example:

```bash
dart run example/roomful_example.dart
```

## Conformance

The protocol is validated against the **shared** cross-SDK vectors that the TypeScript
`@roomful/core` generates (`protocol-fixtures/core-vectors.json`), so the Dart and JS SDKs share one
contract (release gate G2):

```bash
dart test
```

MessagePack vectors are skipped until the Dart codec lands (S05); the JSON vectors cover negotiation
and both envelope versions.

## Roadmap

See the [Roomful roadmap](../../ROADMAP.md) and the
[v2 → v3 backlog](../../docs/project/v2-v3-backlog.md) — EP-11 (this package) and EP-12
(`roomful_flutter`).
