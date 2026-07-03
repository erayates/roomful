# Cross-platform interop

Audience: users.

Roomful's JavaScript SDK (`@roomful/core` and the framework adapters) and its Dart/Flutter SDK
(`roomful`, `roomful_flutter`) speak **one wire protocol** ([RFC-0001](../../rfcs/0001-protocol-v2.md)).
A React web client and a Flutter mobile client can therefore share the **same room** — presence,
cursors, shared state, and events flow between them. The shared contract is proven by the
cross-SDK vectors in [`protocol-fixtures/`](../../protocol-fixtures), which both SDKs decode
identically.

This page covers what interop requires and the payload shapes every client must agree on.

## What interop requires

- **The same relay.** Only the `websocket` transport crosses platforms and devices. `broadcast` is
  same-browser only, and `webrtc` is JS-only — so a cross-platform room must use a relay
  ([self-host one](../getting-started/self-hosting.md)). Point every client at the same
  `relayUrl` and room id.
- **A compatible codec.** `json` is universal and the safe default. `msgpack` is opt-in and only
  used when **both** peers negotiate it over a binary transport; a JSON peer and a MessagePack peer
  still interoperate because the relay re-encodes per recipient.
- **Matching auth.** If the relay enforces auth, every client presents a JWT signed with the same
  secret — see [Auth providers](auth-providers.md).

## Protocol layers

Two layers ride the relay connection:

1. **Relay control** — `join` / `joined` / `peer-joined` / `peer-left` / `transport` / `error`.
   On join, a peer advertises its **capabilities** (protocol version range + codecs); the relay and
   peers negotiate a shared **session** (version `1` or `2`, codec `json` or `msgpack`).
2. **Transport envelope** — each application message is wrapped in a versioned envelope (a legacy
   `v1` envelope, or the modern `v2` envelope with an explicit `codec`) inside a `transport` frame.

Both SDKs implement both layers, so version and codec differences are negotiated automatically. See
[RFC-0001](../../rfcs/0001-protocol-v2.md) for the full specification.

## Message payload contracts

**The relay validates transport payloads and silently drops any that don't match.** So every SDK —
and any message you build by hand — must send these exact shapes. Application fields (a user's
`name`, `color`, etc.) ride as extra properties on top.

| Signal            | Payload shape                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `presence:update` | `{ peer: { id, joinedAt, lastSeen, ...yourPresence } }`                                     |
| `cursor:update`   | `{ cursor: { userId, name, color, x, y, xAbsolute, yAbsolute, idle, element? } }`           |
| `state:update`    | `{ value, history, vectorClock, changedBy, timestamp, reason }` (`reason`: `set`/`patch`/…) |
| `event`           | `{ name, payload, loopback? }`                                                              |

Both SDKs **fill the required `peer` and `cursor` fields for you**: presence is completed
automatically, and cursors go through `useCursors` (JS) or `CursorsEngine.setPosition` (Dart). When
you emit these by hand instead, include **all** required fields — a `presence:update` whose `peer`
omits `joinedAt`/`lastSeen`, or a `cursor:update` missing `userId`/`xAbsolute`/`idle`, is rejected by
the relay and never reaches other peers. `state:update` and `event` payloads are identical across
SDKs.

## Coordinate space

A cursor carries **two** positions:

- `x` / `y` — **normalized** `0..1` coordinates relative to a shared surface. These are the
  interop-safe coordinates: a normalized point maps correctly onto any viewport, so a cursor from a
  1440px-wide web canvas lands in the right place on a 390px-wide phone.
- `xAbsolute` / `yAbsolute` — absolute **pixel** coordinates, meaningful only within the sender's
  own viewport.

For cross-platform rooms, **drive rendering from the normalized `x`/`y`** and multiply by the local
surface size. Flutter's `LiveCursorsOverlay` does this when constructed with `normalized: true`.

## Shared conventions

The protocol carries the shapes above; the **field names inside your presence and shared state are
your app's contract**, and every platform in the room must agree on them:

- **Presence** — pick stable keys (`name`, `color`, …) and use them identically in the React and
  Flutter clients. `roomful_flutter`'s `PresenceAvatars` defaults to `name`/`color`.
- **Shared state** — agree on the value shape. The core keeps one last-write-wins value per room;
  nest fields in a `Map`/object if you need several.
- **Events** — agree on event `name`s and payload shapes.

## Run the cross-platform demo

Two example clients ship in the repo and default to the **same room**, so they collaborate across
platforms: [`examples/cross-platform-interop`](../../examples/cross-platform-interop) (React web)
and the [`roomful_flutter` example](../../dart/roomful_flutter/example/roomful_flutter_example.dart)
(Flutter).

1. **Start a relay** from the repo root:

   ```sh
   docker compose up            # relay on ws://localhost:8787
   ```

2. **Run the web client** against that relay and the shared room:

   ```sh
   pnpm --filter @roomful/example-cross-platform-interop dev
   # http://127.0.0.1:4175/?relay=ws://localhost:8787&room=roomful-interop-demo
   ```

3. **Run the Flutter client** in the same room:

   ```sh
   cd dart/roomful_flutter
   flutter run -t example/roomful_flutter_example.dart \
     --dart-define=ROOMFUL_RELAY_URL=ws://localhost:8787
   ```

Move your cursor in either client and watch presence and cursors appear in the other. From a phone
or a second machine, replace `localhost` with your host's LAN address (and use a TLS-terminated
`wss://` relay for anything public).

## Related docs

- [Protocol RFC-0001](../../rfcs/0001-protocol-v2.md)
- [Self-hosting the relay](../getting-started/self-hosting.md)
- [Auth providers](auth-providers.md)
- [Rooms and transports](../getting-started/rooms-and-transports.md)
