import 'dart:async';

import 'client.dart';
import 'protocol.dart';

/// Live multiplayer cursors on top of a [RoomfulClient]: the local peer publishes its cursor,
/// and remote cursors are tracked (keyed by peer id) and cleared when peers leave.
///
/// Prefer [setPosition] over [set]: the relay validates the cursor payload and drops any that omit
/// a required field (`userId` / `name` / `color` / `x` / `y` / `xAbsolute` / `yAbsolute` / `idle`),
/// so a hand-built partial cursor silently never reaches other peers. [setPosition] fills the
/// mechanical fields for you (see `docs/reference/interop.md`).
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

  /// Publishes the local peer's cursor position, filling the relay-required fields. [x] / [y] are
  /// the normalized `0..1` position (the interop-safe coordinates); [xAbsolute] / [yAbsolute]
  /// default to them when not given. `userId` is the local peer id. Prefer this over [set].
  void setPosition(
    double x,
    double y, {
    String name = '',
    String color = '',
    double? xAbsolute,
    double? yAbsolute,
    bool idle = false,
  }) {
    set(<String, dynamic>{
      'userId': _client.peerId,
      'name': name,
      'color': color,
      'x': x,
      'y': y,
      'xAbsolute': xAbsolute ?? x,
      'yAbsolute': yAbsolute ?? y,
      'idle': idle,
    });
  }

  /// Publishes an arbitrary cursor payload. Low-level: the map must carry every field the relay's
  /// cursor schema requires, or the update is dropped — [setPosition] is the safe alternative.
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
