# Changelog

## 0.1.0-alpha.3

- Point the example at the same relay and room as the React `examples/cross-platform-interop`
  client by default (relay overridable with `--dart-define=ROOMFUL_RELAY_URL=...`), so a Flutter app
  and a web client collaborate in the same room across platforms.

## 0.1.0-alpha.2

- Update the example to publish cursors through `CursorsEngine.setPosition`, so its live cursors
  carry every field the relay requires (a bare `{x, y}` map is dropped). Needs `roomful`
  `>= 0.1.0-alpha.10`.

## 0.1.0-alpha.1

- Initial `v2.2-beta` scaffold (EP-12): `RoomfulProvider` (room lifecycle + injection into the widget
  tree), `RoomController` (a `ChangeNotifier` wrapping the `roomful` client and its presence / cursors /
  events engines), and `RoomfulBuilder` (reactive rebuilds). Re-exports the `roomful` core.
- `PresenceAvatars` — an overlapping avatar stack driven by room presence, with `name` / `color`
  initials, a `+N` overflow chip, and an id-derived colour fallback. Depends only on
  `package:flutter/widgets.dart`.
- `LiveCursorsOverlay` — paints remote peers' live cursors over a child surface (labelled and
  coloured from presence), with pixel or `normalized` (`0..1`) coordinates. Shares the colour
  helpers with `PresenceAvatars`.
- `RoomfulSharedStateBuilder<T>` — a typed, reactive view of the room's shared (last-write-wins)
  value, with a setter to publish changes. `RoomController` now owns a `SharedStateEngine` and
  exposes `sharedValue` / `setSharedState`.
- `example/roomful_flutter_example.dart` — an end-to-end demo wiring a `RoomfulProvider` with
  `PresenceAvatars`, a `LiveCursorsOverlay` canvas, and a shared counter.
