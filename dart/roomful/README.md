# roomful (Dart) — alpha

Open-source, self-hostable realtime collaboration for **Dart and Flutter** apps — the pure-Dart
core client. The Flutter widgets/overlays layer is the separate `roomful_flutter` package.

> **Status: `v2.1-alpha` (EP-11).** Implements the
> [Roomful Protocol v2](../../rfcs/0001-protocol-v2.md) — capabilities, session negotiation, the
> versioned envelope, and the JSON codec — the relay control protocol, a `RoomfulClient` room
> lifecycle (join, peer registry, message relay), and a WebSocket relay transport. It also
> provides the room primitives — presence, cursors, events, last-write-wins shared state, and
> advisory locks — and the MessagePack codec (envelope encode/decode, validated against the shared
> fixtures). Wiring msgpack into the client's negotiated send over a binary transport is the remaining
> step. Not yet published to pub.dev.

## What works today

- `ProtocolCapabilities` + `negotiateSession(...)` — the exact v1..v2 / json↔msgpack negotiation from `@roomful/core`.
- `WireMessage`, `encodeJsonEnvelope`, `decodeJsonEnvelope` — the legacy v1 and modern v2 JSON envelopes.
- The relay control protocol — `buildRelayJoin` / `buildRelayTransport` / `parseRelayServerFrame`.
- `RoomfulClient` — connect and join a relay room, track peers, and relay messages over an injected transport.
- `WebSocketRelayTransport` — a `RoomfulTransport` over a WebSocket relay (or the Cloudflare edge relay).
- `EventEngine` — fire-and-forget room events (`emit` / `on`).
- `PresenceEngine` — live presence, cleaned up when peers leave and re-announced to newcomers.
- `SharedStateEngine` — last-write-wins shared state that converges across peers.
- `CursorsEngine` — live multiplayer cursors, cleared when peers leave.
- `LocksEngine` — advisory distributed locks with deterministic earliest-claim resolution.

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

The vectors cover negotiation, both envelope versions, and both the JSON and MessagePack codecs.

## Roadmap

See the [Roomful roadmap](../../ROADMAP.md) and the
[v2 → v3 backlog](../../docs/project/v2-v3-backlog.md) — EP-11 (this package) and EP-12
(`roomful_flutter`).
