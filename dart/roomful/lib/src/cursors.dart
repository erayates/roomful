import 'dart:async';

import 'client.dart';
import 'protocol.dart';

/// Live multiplayer cursors on top of a [RoomfulClient]: the local peer publishes its cursor,
/// and remote cursors are tracked (keyed by peer id) and cleared when peers leave.
class CursorsEngine {
  CursorsEngine(this._client) {
    _messageSub =
        _client.messages.where((m) => m.type == 'cursor:update').listen(_onCursor);
    _peerSub = _client.peerEvents
        .where((e) => e.change == RoomfulPeerChange.left)
        .listen(_onPeerLeft);
  }

  final RoomfulClient _client;
  late final StreamSubscription<WireMessage> _messageSub;
  late final StreamSubscription<RoomfulPeerEvent> _peerSub;

  final Map<String, Map<String, dynamic>> _remote =
      <String, Map<String, dynamic>>{};
  final StreamController<Map<String, Map<String, dynamic>>> _changes =
      StreamController<Map<String, Map<String, dynamic>>>.broadcast();

  /// Remote cursors, keyed by peer id.
  Map<String, Map<String, dynamic>> get remote =>
      Map<String, Map<String, dynamic>>.unmodifiable(_remote);

  /// Emits the full remote cursor map whenever it changes.
  Stream<Map<String, Map<String, dynamic>>> get changes => _changes.stream;

  /// Publishes the local peer's cursor position.
  void set(Map<String, dynamic> cursor) {
    _client.broadcast(
      WireMessage(
        type: 'cursor:update',
        roomId: _client.roomId,
        fromPeerId: _client.peerId,
        timestamp: DateTime.now().millisecondsSinceEpoch,
        payload: <String, dynamic>{'cursor': cursor},
      ),
    );
  }

  void _onCursor(WireMessage message) {
    final payload = message.payload;
    if (payload is! Map<String, dynamic>) {
      return;
    }
    final cursor = payload['cursor'];
    if (cursor is! Map<String, dynamic>) {
      return;
    }
    _remote[message.fromPeerId] = Map<String, dynamic>.of(cursor);
    _changes.add(remote);
  }

  void _onPeerLeft(RoomfulPeerEvent event) {
    if (_remote.remove(event.peer.peerId) != null) {
      _changes.add(remote);
    }
  }

  /// Cancels the engine's subscriptions.
  Future<void> dispose() async {
    await _messageSub.cancel();
    await _peerSub.cancel();
  }
}
