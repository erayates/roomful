/// Roomful for Flutter — widgets and controllers over the pure-Dart `roomful` core.
///
/// [RoomfulProvider] manages a room's lifecycle for a widget subtree and exposes a
/// [RoomController]; the controller wraps the `roomful` client and its presence / cursors /
/// events engines and notifies listeners as the room changes, so widgets rebuild reactively.
///
/// This re-exports the `roomful` core, so a single import covers the client, protocol, and
/// engines alongside the Flutter layer.
library;

export 'package:roomful/roomful.dart';

export 'src/live_cursors_overlay.dart';
export 'src/presence_avatars.dart';
export 'src/room_controller.dart';
export 'src/roomful_builder.dart';
export 'src/roomful_provider.dart';
