import 'dart:async';

import 'client.dart';
import 'protocol.dart';

/// Last-write-wins shared state on top of a [RoomfulClient]. Writes are ordered by their
/// timestamp, with the peer id as a deterministic tie-break, so all peers converge on the
/// same value regardless of delivery order.
class SharedStateEngine {
  SharedStateEngine(this._client) {
    _sub = _client.messages.where((m) => m.type == 'state:update').listen(_onState);
  }

  final RoomfulClient _client;
  late final StreamSubscription<WireMessage> _sub;

  Object? _value;
  int _timestamp = 0;
  String _changedBy = '';
  final StreamController<Object?> _changes = StreamController<Object?>.broadcast();

  /// The current value.
  Object? get value => _value;

  /// Emits the value whenever it changes.
  Stream<Object?> get changes => _changes.stream;

  /// Sets and broadcasts a new value.
  void set(Object? value) {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    _apply(value, timestamp, _client.peerId);
    _client.broadcast(
      WireMessage(
        type: 'state:update',
        roomId: _client.roomId,
        fromPeerId: _client.peerId,
        timestamp: timestamp,
        payload: <String, dynamic>{
          'value': value,
          'history': <dynamic>[],
          'vectorClock': <String, dynamic>{_client.peerId: timestamp},
          'changedBy': _client.peerId,
          'timestamp': timestamp,
          'reason': 'set',
        },
      ),
    );
  }

  void _onState(WireMessage message) {
    final payload = message.payload;
    if (payload is! Map<String, dynamic>) {
      return;
    }
    final timestamp = payload['timestamp'];
    final changedBy = payload['changedBy'];
    if (timestamp is int && changedBy is String) {
      _apply(payload['value'], timestamp, changedBy);
    }
  }

  void _apply(Object? value, int timestamp, String changedBy) {
    final wins = timestamp > _timestamp ||
        (timestamp == _timestamp && changedBy.compareTo(_changedBy) > 0);
    if (!wins) {
      return;
    }
    _value = value;
    _timestamp = timestamp;
    _changedBy = changedBy;
    _changes.add(value);
  }

  /// Cancels the engine's subscription.
  Future<void> dispose() => _sub.cancel();
}
