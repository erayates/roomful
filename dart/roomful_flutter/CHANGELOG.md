# Changelog

## 0.1.0-alpha.1

- Initial `v2.2-beta` scaffold (EP-12): `RoomfulProvider` (room lifecycle + injection into the widget
  tree), `RoomController` (a `ChangeNotifier` wrapping the `roomful` client and its presence / cursors /
  events engines), and `RoomfulBuilder` (reactive rebuilds). Re-exports the `roomful` core.
- `PresenceAvatars` — an overlapping avatar stack driven by room presence, with `name` / `color`
  initials, a `+N` overflow chip, and an id-derived colour fallback. Depends only on
  `package:flutter/widgets.dart`.
- `LiveCursorsOverlay` — paints remote peers' live cursors over a child surface (labelled and
  coloured from presence), with pixel or `normalized` (`0..1`) coordinates. Shares the colour
  helpers with `PresenceAvatars`. (A shared-state widget layer and example app follow.)
