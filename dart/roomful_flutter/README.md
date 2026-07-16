# roomful_flutter — alpha

Flutter widgets and controllers for **Roomful** — presence, live cursors, comments, locks, and
shared state over a self-hostable relay — built on the pure-Dart [`roomful`](../roomful) core.

> **Status: `v2.2-beta` scaffold (EP-12).** Feature-complete — provides the room lifecycle for Flutter:
> `RoomfulProvider` (connect/disconnect + injection into the widget tree), `RoomController` (a
> `ChangeNotifier` wrapping the client and its presence/cursors/events engines), `RoomfulBuilder`
> (rebuilds on room changes), `PresenceAvatars`, `LiveCursorsOverlay`, `RoomfulSharedStateBuilder`.
> Depends on `roomful` by local path while that package awaits pub.dev publication.

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
- `LiveCursorsOverlay` — paints remote peers' live cursors over a child surface, labelled and coloured from presence. Supports pixel or `normalized` (`0..1`) coordinates.
- `RoomfulSharedStateBuilder<T>` — a typed, reactive view of the room's shared (last-write-wins) value, with a setter to publish changes.

The whole `roomful` core (client, protocol, engines) is re-exported, so a single import is enough.

## Example

[`example/roomful_flutter_example.dart`](example/roomful_flutter_example.dart) wires all four
together — a `RoomfulProvider` hosting `PresenceAvatars`, a `LiveCursorsOverlay` canvas, and a
shared counter. It defaults to the same relay and room as the React
[`examples/cross-platform-interop`](../../examples/cross-platform-interop) client (the public
`wss://relay.roomful.dev`), so the two collaborate across platforms out of the box:

```sh
flutter run -t example/roomful_flutter_example.dart
```

To use a local relay instead, run one (`docker compose up`) and add
`--dart-define=ROOMFUL_RELAY_URL=ws://<your-host>:8787`.

## Roadmap

See the [Roomful roadmap](../../ROADMAP.md) and the
[v2 → v3 backlog](../../docs/project/v2-v3-backlog.md) — EP-12 (`roomful_flutter`).
