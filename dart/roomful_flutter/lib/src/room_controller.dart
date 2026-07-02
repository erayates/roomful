import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:roomful/roomful.dart';

/// A [ChangeNotifier] wrapping a [RoomfulClient] and its room engines so Flutter widgets can
/// react to presence, cursor, and peer changes. Construct it with a client (real or a fake
/// transport in tests); [RoomfulProvider] builds and owns one for you.
class RoomController extends ChangeNotifier {
  RoomController(this.client)
      : presence = PresenceEngine(client),
        cursors = CursorsEngine(client),
        events = EventEngine(client) {
    _peerSub = client.peerEvents.listen(_onChange);
    _presenceSub = presence.changes.listen(_onChange);
    _cursorSub = cursors.changes.listen(_onChange);
  }

  /// The underlying room client.
  final RoomfulClient client;

  /// Live presence for the room.
  final PresenceEngine presence;

  /// Live multiplayer cursors for the room.
  final CursorsEngine cursors;

  /// Fire-and-forget room events.
  final EventEngine events;

  late final StreamSubscription<RoomfulPeerEvent> _peerSub;
  late final StreamSubscription<Map<String, Map<String, dynamic>>> _presenceSub;
  late final StreamSubscription<Map<String, Map<String, dynamic>>> _cursorSub;

  /// The remote peers currently in the room.
  List<RemotePeer> get peers => client.peers;

  /// The room connection state.
  RoomfulConnectionState get state => client.state;

  /// Joins the room.
  Future<void> connect() => client.connect();

  /// Publishes the local peer's presence.
  void setPresence(Map<String, dynamic> data) => presence.set(data);

  /// Publishes the local peer's cursor.
  void setCursor(Map<String, dynamic> cursor) => cursors.set(cursor);

  void _onChange(Object? _) => notifyListeners();

  @override
  void dispose() {
    unawaited(_peerSub.cancel());
    unawaited(_presenceSub.cancel());
    unawaited(_cursorSub.cancel());
    unawaited(presence.dispose());
    unawaited(cursors.dispose());
    unawaited(events.dispose());
    unawaited(client.disconnect());
    super.dispose();
  }
}
