import 'dart:async';

import 'client.dart';
import 'protocol.dart';

/// Live presence on top of a [RoomfulClient]: the local peer publishes a presence map, and
/// remote peers' presence is tracked and cleaned up when they leave. When a new peer joins,
/// the local presence is re-announced so the newcomer learns it.
class PresenceEngine {
  PresenceEngine(this._client) {
    _messageSub =
        _client.messages.where((m) => m.type == 'presence:update').listen(_onPresence);
    _peerSub = _client.peerEvents.listen(_onPeerEvent);
  }

  final RoomfulClient _client;
  late final StreamSubscription<WireMessage> _messageSub;
  late final StreamSubscription<RoomfulPeerEvent> _peerSub;

  Map<String, dynamic> _local = <String, dynamic>{};
  final Map<String, Map<String, dynamic>> _remote =
      <String, Map<String, dynamic>>{};
  final StreamController<Map<String, Map<String, dynamic>>> _changes =
      StreamController<Map<String, Map<String, dynamic>>>.broadcast();

  /// The local peer's presence.
  Map<String, dynamic> get local => Map<String, dynamic>.unmodifiable(_local);

  /// Remote peers' presence, keyed by peer id.
  Map<String, Map<String, dynamic>> get remote =>
      Map<String, Map<String, dynamic>>.unmodifiable(_remote);

  /// Emits the full remote presence map whenever it changes.
  Stream<Map<String, Map<String, dynamic>>> get changes => _changes.stream;

  /// Sets and broadcasts the local peer's presence.
  void set(Map<String, dynamic> data) {
    _local = Map<String, dynamic>.of(data);
    _broadcastLocal();
  }

  void _broadcastLocal() {
    _client.broadcast(
      WireMessage(
        type: 'presence:update',
        roomId: _client.roomId,
        fromPeerId: _client.peerId,
        timestamp: DateTime.now().millisecondsSinceEpoch,
        payload: <String, dynamic>{
          'peer': <String, dynamic>{'id': _client.peerId, ..._local},
        },
      ),
    );
  }

  void _onPresence(WireMessage message) {
    final payload = message.payload;
    if (payload is! Map<String, dynamic>) {
      return;
    }
    final peer = payload['peer'];
    if (peer is! Map<String, dynamic>) {
      return;
    }
    final id = peer['id'];
    if (id is! String) {
      return;
    }
    _remote[id] = Map<String, dynamic>.of(peer);
    _changes.add(remote);
  }

  void _onPeerEvent(RoomfulPeerEvent event) {
    switch (event.change) {
      case RoomfulPeerChange.joined:
        if (_local.isNotEmpty) {
          _broadcastLocal();
        }
      case RoomfulPeerChange.left:
        if (_remote.remove(event.peer.peerId) != null) {
          _changes.add(remote);
        }
    }
  }

  /// Cancels the engine's subscriptions.
  Future<void> dispose() async {
    await _messageSub.cancel();
    await _peerSub.cancel();
  }
}
