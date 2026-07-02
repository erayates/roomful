import 'dart:async';

import 'client.dart';
import 'protocol.dart';

/// Fire-and-forget room events on top of a [RoomfulClient]. Handlers fire for events from
/// other peers — a broadcast is not echoed back to its sender.
class EventEngine {
  EventEngine(this._client) {
    _sub = _client.messages.where((m) => m.type == 'event').listen(_onEvent);
  }

  final RoomfulClient _client;
  late final StreamSubscription<WireMessage> _sub;
  final Map<String, List<void Function(Object?)>> _handlers =
      <String, List<void Function(Object?)>>{};

  /// Broadcasts an event named [name] with [payload] to the room.
  void emit(String name, Object? payload) {
    _client.broadcast(
      WireMessage(
        type: 'event',
        roomId: _client.roomId,
        fromPeerId: _client.peerId,
        timestamp: DateTime.now().millisecondsSinceEpoch,
        payload: <String, dynamic>{'name': name, 'payload': payload},
      ),
    );
  }

  /// Registers a [handler] for events named [name].
  void on(String name, void Function(Object?) handler) {
    (_handlers[name] ??= <void Function(Object?)>[]).add(handler);
  }

  void _onEvent(WireMessage message) {
    final payload = message.payload;
    if (payload is! Map<String, dynamic>) {
      return;
    }
    final name = payload['name'];
    if (name is! String) {
      return;
    }
    for (final handler in _handlers[name] ?? const <void Function(Object?)>[]) {
      handler(payload['payload']);
    }
  }

  /// Cancels the engine's subscription.
  Future<void> dispose() => _sub.cancel();
}
