# Changelog

## 0.1.0-alpha.1

- Initial `v2.2-beta` scaffold (EP-12): `RoomfulProvider` (room lifecycle + injection into the widget
  tree), `RoomController` (a `ChangeNotifier` wrapping the `roomful` client and its presence / cursors /
  events engines), and `RoomfulBuilder` (reactive rebuilds). Re-exports the `roomful` core. Higher-level
  widgets (presence avatars, live-cursor overlay, shared-state layer) follow.
