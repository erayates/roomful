import 'dart:async';

import 'client.dart';
import 'protocol.dart';

/// Advisory distributed locks on top of a [RoomfulClient], carried over the event channel with
/// reserved `roomful:lock:*` names. Claims resolve deterministically — the earliest timestamp
/// wins, with the peer id as a tie-break — so every peer agrees on the holder without a central
/// authority. Acquisition is optimistic ([acquire] is fire-and-forget); read [holder] /
/// [isHeldByMe] for the resolved owner, or await [acquireBlocking] to hold until you own it.
class LocksEngine {
  LocksEngine(this._client) {
    _messageSub =
        _client.messages.where((m) => m.type == 'event').listen(_onEvent);
    _peerSub = _client.peerEvents
        .where((e) => e.change == RoomfulPeerChange.left)
        .listen(_onPeerLeft);
  }

  static const String _acquireEvent = 'roomful:lock:acquire';
  static const String _releaseEvent = 'roomful:lock:release';

  final RoomfulClient _client;
  late final StreamSubscription<WireMessage> _messageSub;
  late final StreamSubscription<RoomfulPeerEvent> _peerSub;

  final Map<String, Map<String, int>> _claims = <String, Map<String, int>>{};
  final StreamController<String> _changes = StreamController<String>.broadcast();

  /// Emits a lock key whenever its holder may have changed.
  Stream<String> get changes => _changes.stream;

  /// Optimistically claims [key] and broadcasts the claim.
  void acquire(String key) {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    _record(key, _client.peerId, timestamp);
    _emit(_acquireEvent, key, _client.peerId, timestamp);
  }

  /// Claims [key] like [acquire], then resolves once the local peer is the holder — immediately
  /// when the lock is free, or after an earlier holder releases or leaves. Returns `false`, and
  /// retracts the local claim, if [timeout] elapses first.
  Future<bool> acquireBlocking(
    String key, {
    Duration timeout = const Duration(seconds: 5),
  }) async {
    acquire(key);
    if (isHeldByMe(key)) {
      return true;
    }
    final completer = Completer<bool>();
    final subscription = changes.where((changed) => changed == key).listen((_) {
      if (!completer.isCompleted && isHeldByMe(key)) {
        completer.complete(true);
      }
    });
    final timer = Timer(timeout, () {
      if (!completer.isCompleted) {
        completer.complete(false);
      }
    });
    final acquired = await completer.future;
    await subscription.cancel();
    timer.cancel();
    if (!acquired) {
      release(key);
    }
    return acquired;
  }

  /// Releases the local peer's claim on [key] and broadcasts the release.
  void release(String key) {
    _remove(key, _client.peerId);
    _emit(_releaseEvent, key, _client.peerId,
        DateTime.now().millisecondsSinceEpoch);
  }

  /// The peer id currently holding [key], or `null` when it is free.
  String? holder(String key) {
    final claims = _claims[key];
    if (claims == null || claims.isEmpty) {
      return null;
    }
    String? best;
    int? bestTimestamp;
    for (final entry in claims.entries) {
      final timestamp = entry.value;
      final isBetter = bestTimestamp == null ||
          timestamp < bestTimestamp ||
          (timestamp == bestTimestamp && entry.key.compareTo(best!) < 0);
      if (isBetter) {
        best = entry.key;
        bestTimestamp = timestamp;
      }
    }
    return best;
  }

  /// Whether the local peer holds [key].
  bool isHeldByMe(String key) => holder(key) == _client.peerId;

  void _emit(String name, String key, String peerId, int timestamp) {
    _client.broadcast(
      WireMessage(
        type: 'event',
        roomId: _client.roomId,
        fromPeerId: _client.peerId,
        timestamp: timestamp,
        payload: <String, dynamic>{
          'name': name,
          'payload': <String, dynamic>{
            'key': key,
            'peerId': peerId,
            'timestamp': timestamp,
          },
        },
      ),
    );
  }

  void _onEvent(WireMessage message) {
    final payload = message.payload;
    if (payload is! Map<String, dynamic>) {
      return;
    }
    final name = payload['name'];
    final data = payload['payload'];
    if (name is! String || data is! Map<String, dynamic>) {
      return;
    }
    final key = data['key'];
    final peerId = data['peerId'];
    final timestamp = data['timestamp'];
    if (key is! String || peerId is! String || timestamp is! int) {
      return;
    }
    if (name == _acquireEvent) {
      _record(key, peerId, timestamp);
    } else if (name == _releaseEvent) {
      _remove(key, peerId);
    }
  }

  void _onPeerLeft(RoomfulPeerEvent event) {
    for (final entry in _claims.entries.toList()) {
      if (entry.value.remove(event.peer.peerId) != null) {
        _changes.add(entry.key);
      }
    }
  }

  void _record(String key, String peerId, int timestamp) {
    (_claims[key] ??= <String, int>{})[peerId] = timestamp;
    _changes.add(key);
  }

  void _remove(String key, String peerId) {
    final claims = _claims[key];
    if (claims != null && claims.remove(peerId) != null) {
      if (claims.isEmpty) {
        _claims.remove(key);
      }
      _changes.add(key);
    }
  }

  /// Cancels the engine's subscriptions.
  Future<void> dispose() async {
    await _messageSub.cancel();
    await _peerSub.cancel();
  }
}
