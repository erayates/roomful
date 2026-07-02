import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'protocol.dart';
import 'relay.dart';
import 'transport.dart';

int _wallClock() => DateTime.now().millisecondsSinceEpoch;

/// A remote peer in the room.
class RemotePeer {
  const RemotePeer({required this.peerId, this.protocol});

  final String peerId;
  final ProtocolCapabilities? protocol;
}

/// The lifecycle state of a [RoomfulClient].
enum RoomfulConnectionState { idle, connecting, connected, disconnected }

/// Whether a peer joined or left.
enum RoomfulPeerChange { joined, left }

/// A peer joining or leaving the room.
class RoomfulPeerEvent {
  const RoomfulPeerEvent({required this.change, required this.peer});

  final RoomfulPeerChange change;
  final RemotePeer peer;
}

/// Auto-reconnect policy for a [RoomfulClient]: how many times to retry a dropped connection, and
/// the backoff between attempts — doubling from [initialDelay], capped at [maxDelay].
class RoomfulReconnect {
  const RoomfulReconnect({
    this.maxAttempts = 5,
    this.initialDelay = const Duration(milliseconds: 300),
    this.maxDelay = const Duration(seconds: 10),
  });

  final int maxAttempts;
  final Duration initialDelay;
  final Duration maxDelay;
}

/// The Roomful room client. It drives a [RoomfulTransport] with the relay protocol:
/// advertises capabilities, joins the room, tracks peers, and relays messages. The
/// transport is injected, so the client is testable against any transport — a real
/// WebSocket relay, or a fake in tests.
///
/// The room-primitive APIs (presence, cursors, events, shared state) build on this in a
/// following milestone; today it exposes the raw [messages] stream and the [peers] registry.
class RoomfulClient {
  RoomfulClient({
    required this.roomId,
    required this.peerId,
    required RoomfulTransport transport,
    ProtocolCapabilities? capabilities,
    bool supportsBinary = false,
    RoomfulReconnect? reconnect,
    int Function()? clock,
  })  : _transport = transport,
        capabilities =
            capabilities ?? ProtocolCapabilities.create(<String>['json'], 'json'),
        _supportsBinary = supportsBinary,
        _reconnect = reconnect,
        _clock = clock ?? _wallClock;

  final String roomId;
  final String peerId;
  final ProtocolCapabilities capabilities;

  final RoomfulTransport _transport;
  final bool _supportsBinary;
  final RoomfulReconnect? _reconnect;
  final int Function() _clock;

  final Map<String, RemotePeer> _peers = <String, RemotePeer>{};
  final StreamController<WireMessage> _messages =
      StreamController<WireMessage>.broadcast();
  final StreamController<RoomfulPeerEvent> _peerEvents =
      StreamController<RoomfulPeerEvent>.broadcast();
  final StreamController<void> _reconnects = StreamController<void>.broadcast();

  StreamSubscription<Object>? _inboundSub;
  Completer<void>? _joined;
  RoomfulConnectionState _state = RoomfulConnectionState.idle;
  bool _closing = false;
  bool _reconnecting = false;
  bool _hasConnected = false;

  /// The current lifecycle state.
  RoomfulConnectionState get state => _state;

  /// The remote peers currently in the room.
  List<RemotePeer> get peers => List<RemotePeer>.unmodifiable(_peers.values);

  /// Inbound peer messages, already unwrapped from their relay frames.
  Stream<WireMessage> get messages => _messages.stream;

  /// Peer join/leave events.
  Stream<RoomfulPeerEvent> get peerEvents => _peerEvents.stream;

  /// Fires after the client re-joins the room following a dropped connection (never for the
  /// initial connect). Engines listen to this to re-announce their state.
  Stream<void> get reconnects => _reconnects.stream;

  /// Opens the transport, joins the room, and completes once the relay acknowledges the
  /// join with a `joined` frame. If a [RoomfulReconnect] policy was given, a later dropped
  /// connection is re-established automatically.
  Future<void> connect() async {
    if (_state == RoomfulConnectionState.connecting ||
        _state == RoomfulConnectionState.connected) {
      return;
    }
    _closing = false;
    _state = RoomfulConnectionState.connecting;
    final joined = Completer<void>();
    _joined = joined;
    await _openAndSendJoin();
    await joined.future;
  }

  /// Opens the transport, (re)subscribes to its inbound frames, and sends a `join`. Shared by
  /// the initial [connect] and the reconnect loop; the `joined` reply is handled in [_onInbound].
  Future<void> _openAndSendJoin() async {
    await _transport.connect();
    await _inboundSub?.cancel();
    _inboundSub = _transport.inbound.listen(
      _onInbound,
      onError: (Object _) => _onDrop(),
      onDone: _onDrop,
    );
    _transport.send(
      jsonEncode(
        buildRelayJoin(roomId: roomId, peerId: peerId, protocol: capabilities),
      ),
    );
  }

  /// Broadcasts [message] to the whole room.
  void broadcast(WireMessage message) => _send(message, _uplinkSession);

  /// Sends [message] to a single peer. Encoded on the client's uplink session; the relay
  /// re-encodes it for the target's session.
  void sendTo(String targetPeerId, WireMessage message) {
    _send(
      WireMessage(
        type: message.type,
        roomId: message.roomId,
        fromPeerId: message.fromPeerId,
        toPeerId: targetPeerId,
        timestamp: message.timestamp,
        payload: message.payload,
      ),
      _uplinkSession,
    );
  }

  /// Leaves the room and closes the transport. Cancels any in-flight auto-reconnect.
  Future<void> disconnect() async {
    _closing = true;
    if (_state == RoomfulConnectionState.connected) {
      _transport.send(
        jsonEncode(buildRelayLeave(roomId: roomId, peerId: peerId)),
      );
    }
    await _teardown();
  }

  /// Handles the transport inbound stream ending or erroring: reconnects when a policy is set and
  /// the client is not intentionally closing, otherwise moves to disconnected.
  void _onDrop() {
    if (_closing || _reconnecting) {
      return;
    }
    if (_reconnect == null) {
      _state = RoomfulConnectionState.disconnected;
      return;
    }
    _reconnecting = true;
    unawaited(_reconnectLoop().whenComplete(() => _reconnecting = false));
  }

  Future<void> _reconnectLoop() async {
    final policy = _reconnect;
    if (policy == null) {
      return;
    }
    _state = RoomfulConnectionState.connecting;
    var delay = policy.initialDelay;
    for (var attempt = 0; attempt < policy.maxAttempts; attempt++) {
      await Future<void>.delayed(delay);
      if (_closing) {
        return;
      }
      try {
        await _openAndSendJoin();
        return; // Transport re-opened and join sent; the `joined` reply confirms and re-announces.
      } on Object {
        delay = _cappedDelay(delay, policy.maxDelay);
      }
    }
    _state = RoomfulConnectionState.disconnected;
  }

  Duration _cappedDelay(Duration current, Duration max) {
    final doubled = current * 2;
    return doubled > max ? max : doubled;
  }

  /// The session the client encodes its outbound transport frames with, derived from its own
  /// capabilities and whether its transport carries binary. The relay re-encodes per recipient,
  /// so this is the client's uplink codec — msgpack only when both are in play — not any peer's.
  ProtocolSession get _uplinkSession =>
      negotiateSession(capabilities, capabilities,
                  supportsBinary: _supportsBinary)
              .session ??
          ProtocolSession.legacyV1;

  void _send(WireMessage message, ProtocolSession session) {
    final frame = buildRelayTransport(buildJsonEnvelope(message, session));
    _transport.send(
      session.codec == 'msgpack' ? encodeMsgpackFrame(frame) : jsonEncode(frame),
    );
  }

  void _onInbound(Object data) {
    final Object? decoded;
    if (data is String) {
      decoded = jsonDecode(data);
    } else if (data is Uint8List) {
      decoded = decodeMsgpackFrame(data);
    } else if (data is List<int>) {
      decoded = decodeMsgpackFrame(Uint8List.fromList(data));
    } else {
      return;
    }
    if (decoded is! Map<String, dynamic>) {
      return;
    }

    final frame = parseRelayServerFrame(decoded);
    switch (frame) {
      case RelayJoined(:final peers):
        _peers.clear();
        for (final peer in peers) {
          _peers[peer.peerId] =
              RemotePeer(peerId: peer.peerId, protocol: peer.protocol);
        }
        _state = RoomfulConnectionState.connected;
        final wasReconnect = _hasConnected;
        _hasConnected = true;
        _joined?.complete();
        _joined = null;
        if (wasReconnect) {
          _reconnects.add(null);
        }
      case RelayPeerJoined(:final peerId, :final protocol):
        final peer = RemotePeer(peerId: peerId, protocol: protocol);
        _peers[peerId] = peer;
        _peerEvents
            .add(RoomfulPeerEvent(change: RoomfulPeerChange.joined, peer: peer));
      case RelayPeerLeft(:final peerId):
        final removed = _peers.remove(peerId);
        if (removed != null) {
          _peerEvents
              .add(RoomfulPeerEvent(change: RoomfulPeerChange.left, peer: removed));
        }
      case RelayTransportFrame(:final message):
        _messages.add(decodeJsonEnvelopeObject(message, now: _clock));
      case RelayErrorFrame():
        break;
      case null:
        break;
    }
  }

  Future<void> _teardown() async {
    await _inboundSub?.cancel();
    _inboundSub = null;
    await _transport.close();
    final joined = _joined;
    _joined = null;
    _state = RoomfulConnectionState.disconnected;
    if (joined != null && !joined.isCompleted) {
      joined.completeError(
        StateError('Disconnected before the room join completed.'),
      );
    }
  }
}
