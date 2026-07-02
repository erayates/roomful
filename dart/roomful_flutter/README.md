# roomful_flutter — alpha

Flutter widgets and controllers for **Roomful** — presence, live cursors, comments, locks, and
shared state over a self-hostable relay — built on the pure-Dart [`roomful`](../roomful) core.

> **Status: `v2.2-beta` scaffold (EP-12).** This provides the room lifecycle for Flutter:
> `RoomfulProvider` (connect/disconnect + injection into the widget tree), `RoomController` (a
> `ChangeNotifier` wrapping the client and its presence/cursors/events engines), and `RoomfulBuilder`
> (rebuilds on room changes). The higher-level widgets — `PresenceAvatars`, `LiveCursorsOverlay`, a
> shared-state widget layer — land next. Not yet published to pub.dev.

## Usage

```dart
RoomfulProvider(
  roomId: 'doc-123',
  peerId: myPeerId,
  relayUrl: 'wss://relay.example/?room=doc-123',
  child: RoomfulBuilder(
    builder: (context, room) => Text('${room.peers.length} peers online'),
  ),
)
```

Publish presence or a cursor from anywhere below the provider:

```dart
RoomfulProvider.of(context).setPresence({'name': 'Alice', 'color': '#5cc7ab'});
```

## What works today

- `RoomfulProvider` — joins on mount, disconnects on dispose, exposes a `RoomController` via `RoomfulProvider.of(context)`.
- `RoomController` — a `ChangeNotifier` with `peers`, `presence`, `cursors`, `events`, `connect()`, `setPresence()`, `setCursor()`.
- `RoomfulBuilder` — rebuilds its subtree whenever the room changes.
- `PresenceAvatars` — an overlapping avatar stack driven by presence (`name` / `color` initials, a `+N` overflow chip). Reads the nearest provider, or pass a `controller`.

The whole `roomful` core (client, protocol, engines) is re-exported, so a single import is enough.

## Roadmap

See the [Roomful roadmap](../../ROADMAP.md) and the
[v2 → v3 backlog](../../docs/project/v2-v3-backlog.md) — EP-12 (`roomful_flutter`).
