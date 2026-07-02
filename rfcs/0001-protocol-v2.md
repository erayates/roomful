# RFC-0001: Roomful Protocol v2 — Versioned Event Envelope & Cross-SDK Contract

| Field      | Value                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| RFC        | 0001                                                                                       |
| Title      | Roomful Protocol v2 — versioned event envelope & cross-SDK contract                        |
| Status     | Draft                                                                                      |
| Target     | v2.0-beta                                                                                  |
| Epic       | [EP-10 Protocol Governance & Compatibility](../docs/project/v2-v3-backlog.md)              |
| Issues     | #101 (this RFC); relates to #102 (test vectors), #103 (identifiers), #104 (state channels) |
| Supersedes | —                                                                                          |

## Summary

Roomful already speaks a versioned wire protocol (a v1 "legacy" envelope and a v2 "modern"
envelope with JSON/MessagePack codec negotiation), implemented in `@roomful/core`
(`packages/core/src/protocol/peer-message.ts`) and mirrored by `@roomful/relay`
(`packages/relay/src/protocol.ts`). It has never been written down as a **public, SDK-independent
contract.**

This RFC does three things:

1. **Documents Protocol v2 as it exists today** — the transport envelope, capability negotiation,
   codecs, message families, and the relay control layer — so a non-TypeScript SDK (Dart/Flutter,
   and later native) can implement it faithfully.
2. **Formalizes cross-SDK concerns** the Flutter/mobile expansion needs: canonical identifiers
   (#103) and an explicit **ephemeral / durable / AI** state-channel taxonomy (#104).
3. **Reserves** the forward-looking message families (AI-agent actions, approvals, field presence,
   record locks) so later milestones extend the protocol additively without a breaking bump.

Nothing here changes the current on-the-wire behavior; it is documentation plus reserved namespace.
The stable contract is **frozen only at v3.0** (gate G8); v2.x may extend it behind version
negotiation with migration notes.

## Motivation

- **Cross-platform parity (P3, P4).** Dart/Flutter (EP-11, EP-12) must interoperate in the _same
  room_ as the JS SDKs. Without a written contract, a second implementation is reverse-engineering.
- **Compliance testing (#102).** "One protocol" is only real if JS, Dart, and the relay pass the
  **same** fixture vectors. Those fixtures need a spec to test against.
- **Additive AI + B2B growth.** AI-agent collaboration (EP-17) and B2B primitives (EP-15) introduce
  new event families. Reserving their names now prevents a breaking protocol bump later.
- **A credible freeze at v3.** G8 requires a frozen, migration-safe protocol. That freeze must be
  written, versioned, and test-backed — starting here.

## Guide-level overview

A Roomful session is a set of **peers** in a **room** exchanging **wire messages** over a
**transport**. The protocol is transport-agnostic: the same messages ride BroadcastChannel, WebRTC
data channels, a WebSocket/WebTransport relay, or long-poll — each transport only frames bytes.

Two peers **negotiate** a session on join (capabilities in `hello`/`welcome`), agreeing a **version**
(1 or 2) and a **codec** (`json` or `msgpack`). Every subsequent message is wrapped in a **transport
envelope** carrying `source`, version, routing (`roomId`/`fromPeerId`/`toPeerId`), a `type`, and a
typed `payload`.

Message families map to **state channels** with different durability and cost:

- **Ephemeral** — `presence:update`, `cursor:update`, `awareness:update` (+ reserved `viewport`,
  `selection`, `typing`). Fast, lossy-tolerant, not persisted.
- **Durable** — `state:update`, `crdt:sync`, `crdt:awareness`, `event`, `leave` (+ reserved
  `comment.*`, `lock.*`, `approval.*`, `history`). Verifiable, auditable, storage-policy bound.
- **AI** — reserved `agent.*` (agent step, cursor, proposed edit, confidence, failure). Modeled
  separately for explainability and human approval.
- **Control** — `hello`, `welcome`, `encrypted`, and the relay control messages (`join`, `joined`,
  `peer-joined`, `peer-left`, `error`).

## Reference: Protocol v2 as implemented today

> These sections are normative for **current** behavior. Types are shown in TypeScript notation for
> precision; SDKs implement the equivalent in their own language.

### Identifiers (#103)

| Identifier        | Type   | Meaning                                                                                                                                  | Status              |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `roomId`          | string | Collaboration scope. Peers with the same `roomId` share a session.                                                                       | Stable              |
| `peerId`          | string | Per-connection participant id. UUIDv4 from Web Crypto in `@roomful/core`.                                                                | Stable              |
| `sessionId`       | string | Per-connect lifecycle id (survives message loss, not reconnect). Reserved for recording/replay/audit correlation.                        | **Reserved (v2.x)** |
| `surfaceId`       | string | Logical surface within a room (canvas, form, document pane) for scoping cursors/presence/anchors.                                        | **Reserved (v2.x)** |
| `coordinateSpace` | string | Named coordinate system for cursors/anchors (e.g. `viewport`, `document`, `record:<id>`), so Flutter and web map positions consistently. | **Reserved (v2.x)** |

`roomId`/`peerId` are on the wire today. `sessionId`/`surfaceId`/`coordinateSpace` are reserved
optional fields — SDKs MUST ignore unknown fields (see Compatibility) so they can be added additively.

### Capability negotiation

Peers advertise capabilities inside the `hello`/`welcome` payload `protocol` field:

```ts
interface PeerProtocolCapabilities {
  minVersion: 1;
  maxVersion: 2;
  codecs: ('json' | 'msgpack')[]; // de-duplicated, non-empty
  preferredCodec: 'json' | 'msgpack'; // must be a member of codecs
}
```

Negotiation (each peer, deterministically, against the remote's advertised capabilities):

1. If the remote advertises **no** capabilities → session is **legacy** `{ version: 1, codec: 'json',
legacy: true }`.
2. `sharedMin = max(localMin, remoteMin)`, `sharedMax = min(localMax, remoteMax)`. If
   `sharedMin > sharedMax` → **incompatible** (reject the peer).
3. `version = sharedMax` (prefer 2).
4. `codec = 'msgpack'` iff `version >= 2` **and** the transport supports binary **and** both peers
   list `msgpack`; otherwise `json`.

The result is a `PeerProtocolSession { version, codec, legacy }` used to encode all outbound messages
to that peer. Bootstrap messages (`hello`/`welcome`) always use the legacy session so a peer can be
understood before negotiation completes.

### Transport envelope

Every wire message is one of two envelope shapes.

**Legacy (v1):**

```ts
interface LegacyPeerTransportEnvelope {
  source: 'roomful';
  version: 1;
  signal: {
    type: PeerWireMessageType;
    roomId: string;
    fromPeerId: string;
    toPeerId?: string;
    payload?: unknown; // for `event`, wrapped as { event: <payload> }
  };
}
```

**Modern (v2):**

```ts
interface ModernPeerTransportEnvelope {
  source: 'roomful';
  protocolVersion: 2;
  codec: 'json' | 'msgpack';
  roomId: string;
  fromPeerId: string;
  toPeerId?: string; // absent = broadcast to the room; present = direct
  timestamp: number; // ms since epoch
  type: PeerWireMessageType;
  payload: PeerWirePayloadByType[type];
}
```

`source: 'roomful'` tags Roomful traffic. Routing: `toPeerId` present ⇒ deliver to that peer;
absent ⇒ broadcast to all room peers except the sender.

### Codecs

- **json** — the envelope is a UTF-8 JSON string.
- **msgpack** — the envelope object is MessagePack-encoded to a `Uint8Array`. Only used on a v2
  session over a binary-capable transport when both peers advertise `msgpack`.

Binary payload fields (`crdt:sync`/`crdt:awareness` data, `encrypted` iv/ciphertext) are `Uint8Array`
under msgpack and `number[]` under json (`BinaryWireData = Uint8Array | number[]`).

### Message families & payloads

Current `PeerWireMessageType` values and their payloads (channel in brackets):

| Type               | Channel   | Payload                                                                              |
| ------------------ | --------- | ------------------------------------------------------------------------------------ |
| `hello`            | control   | `{ peer, protocol?, encryption? }` — join announcement + capabilities                |
| `welcome`          | control   | `{ peer, protocol?, encryption? }` — reply to `hello`                                |
| `encrypted`        | control   | `{ version: 1, iv, ciphertext }` — wraps any message when E2E encryption is on       |
| `presence:update`  | ephemeral | `{ peer }`                                                                           |
| `cursor:update`    | ephemeral | `{ cursor: CursorPosition }`                                                         |
| `awareness:update` | ephemeral | `{ awareness: AwarenessState }`                                                      |
| `leave`            | durable   | `{ peer? }`                                                                          |
| `event`            | durable   | `{ name, payload, loopback? }` — application custom events                           |
| `state:update`     | durable   | `{ value, history[], vectorClock, changedBy, timestamp, reason }` — LWW/custom state |
| `crdt:sync`        | durable   | `{ kind: 'state-vector' \| 'update', data, meta? }` — Yjs sync                       |
| `crdt:awareness`   | durable   | `{ data }` — Yjs awareness                                                           |

The `encrypted` envelope carries an encrypted inner message; `EncryptionHandshake { version: 1 }` is
advertised in `hello`/`welcome`. Encryption is negotiated out of band of the codec and is opt-in.

### Relay control layer

When a transport uses a relay (`websocket`, `webtransport`, `polling`), the relay adds a thin control
layer around the peer envelope (`@roomful/relay`):

- **Client → relay:** `join { roomId, peerId, protocol?, maxPeers?, token? }`, `leave { roomId,
peerId }`, and `transport { message: <peer envelope> }` (the relay never inspects the inner
  payload).
- **Relay → client:** `joined { roomId, peerId, peers[] }`, `peer-joined { roomId, peerId, protocol?
}`, `peer-left { roomId, peerId }`, `transport { message }`, `error { code, message }`.

The relay is a **routing fabric**: it fans out `transport` frames (respecting `toPeerId`) and tracks
room membership. It does not persist or interpret peer payloads. This is what let the WebTransport
transport and the Cloudflare edge relay (v1.8) reuse the exact same protocol unchanged.

## Reserved extensions (v2.x, additive)

These are **not** implemented yet. They are reserved here so later milestones add them without a
breaking version bump. SDKs MUST ignore unknown message types and unknown fields (below), which makes
these additive.

| Reserved type / field                                   | Channel   | Milestone | Purpose                                                     |
| ------------------------------------------------------- | --------- | --------- | ----------------------------------------------------------- |
| `field.focus` / `field.blur`                            | ephemeral | v2.4      | Field-level presence (#151-#153, forms/records)             |
| `lock.acquire` / `lock.release` / `lock.request`        | durable   | v2.4      | Record/field locks + request-control                        |
| `comment.create` / `comment.resolve` / `comment.anchor` | durable   | v2.4-v2.5 | Durable comments + anchors (`surfaceId`/`coordinateSpace`)  |
| `approval.request` / `approval.resolve`                 | durable   | v2.5      | Collaborative approval flow                                 |
| `agent.presence` / `agent.action` / `agent.proposal`    | AI        | v2.5      | AI-agent presence, structured action stream, proposed edits |
| `history.*`                                             | durable   | v2.6      | Activity/audit stream events                                |
| `intent`                                                | ephemeral | v2.6      | User intent states (editing/reviewing/approving)            |

`participant.type = human | agent | system | bot | observer` is reserved on `Peer` metadata for the
human + AI participant model (EP-17).

## Versioning & backward compatibility

Normative rules (gate **G1** applies these to all of v2.x):

1. **Additive by default.** New message types, new optional envelope/payload fields, and new codecs
   are additive and do **not** bump the protocol version.
2. **Ignore-unknown is mandatory.** A conformant SDK MUST ignore unknown message `type`s and unknown
   object fields rather than erroring. This is the mechanism that makes reserved extensions safe.
3. **A version bump (→ 3) is required only** for a change that alters the meaning of an existing
   field, removes a field, or changes routing/negotiation semantics.
4. **Coexistence.** v1 and v2 peers interoperate: a v2 peer that negotiates `legacy` with a
   non-advertising peer speaks the v1 envelope to it. SDKs MUST implement both envelope shapes for
   read; v1 is the mandatory floor.
5. **Codec independence.** JSON is the mandatory floor codec; msgpack is an optional negotiated
   optimization. An SDK MAY ship JSON-only and still be conformant.
6. **Freeze at v3 (G8).** The contract is declared stable at v3.0. After the freeze, changes follow
   the deprecation policy below.

### Migration policy

- v2.x: the protocol evolves additively; changes land with test vectors (#102) and a changelog entry.
- Deprecations carry a documented window (min one minor) with both old and new accepted during it.
- v2 → v3: a migration guide (#243) and a `roomful doctor`-style compatibility check (#244) precede
  the RC. No v3 RC until Flutter, web, relay, and cloud clients pass the shared fixtures (G8).

## Cross-SDK compliance & test vectors (#102)

Conformance is defined by **shared fixtures**, not by any one implementation:

- A canonical vector set lives at [`protocol-fixtures/core-vectors.json`](../protocol-fixtures/README.md)
  — `(session, message) → wire bytes` envelope vectors across the legacy v1 and modern v2 envelopes and
  both codecs, plus negotiation vectors. It is generated from `@roomful/core` and drift-guarded by
  `packages/core/src/protocol/protocol-fixtures.test.ts` (#102, delivered with this RFC). Because the
  current capabilities fix `minVersion: 1`/`maxVersion: 2`, all valid capabilities overlap, so an
  "incompatible" vector is reserved for when a non-overlapping version range becomes representable.
- Each SDK (JS, the future `roomful` Dart client) and the relay run the **same** fixtures:
  decode-round-trip is the primary order-independent gate; byte-exact encode is best-effort (map-key
  order). A "same-room" interop demo (JS ⇄ Dart via the relay) is the end-to-end gate (G2).
- Fixtures are versioned with the protocol; adding a reserved type ships new vectors.

## Drawbacks & alternatives

- **Writing the spec freezes assumptions early.** Mitigated by keeping v2.x explicitly additive and
  deferring the hard freeze to v3.
- **Alternative: adopt an existing protocol (e.g. a generic pub/sub or CRDT-sync spec).** Rejected —
  Roomful's value is the _typed collaboration_ families (presence/cursor/locks/approvals/agents),
  which generic protocols do not model.
- **Alternative: JSON-only, drop msgpack.** Rejected — msgpack already ships and materially reduces
  CRDT/binary payload size; keeping it optional/negotiated costs little.

## Open questions

- Exact `coordinateSpace` grammar for cross-platform (web DOM vs Flutter canvas) mapping — resolve in
  EP-12 (#124) against a real Flutter overlay.
- Whether `sessionId` is relay-issued or client-issued (recording/audit correlation vs privacy).
- Whether AI `agent.*` actions reuse the `event` family with a reserved namespace or get first-class
  types — decide in EP-17 (#173).

## Acceptance (per #101)

- [ ] The current envelope, negotiation, codecs, message families, and relay control layer are
      documented accurately (this RFC).
- [ ] Identifiers (#103) and the ephemeral/durable/AI state channels (#104) are defined.
- [ ] Versioning, backward-compatibility, and migration policy are stated.
- [ ] Reserved extension namespace is listed so later milestones are additive.
- [ ] RFC reviewed and merged; `protocol-fixtures` scope (#102) is agreed as the compliance mechanism.
