import 'dart:async';
import 'dart:convert';

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
    int Function()? clock,
  })  : _transport = transport,
        capabilities =
            capabilities ?? ProtocolCapabilities.create(<String>['json'], 'json'),
        _clock = clock ?? _wallClock;

  final String roomId;
  final String peerId;
  final ProtocolCapabilities capabilities;

  final RoomfulTransport _transport;
  final int Function() _clock;

  final Map<String, RemotePeer> _peers = <String, RemotePeer>{};
  final StreamController<WireMessage> _messages =
      StreamController<WireMessage>.broadcast();
  final StreamController<RoomfulPeerEvent> _peerEvents =
      StreamController<RoomfulPeerEvent>.broadcast();

  StreamSubscription<Object>? _inboundSub;
  Completer<void>? _joined;
  RoomfulConnectionState _state = RoomfulConnectionState.idle;

  /// The current lifecycle state.
  RoomfulConnectionState get state => _state;

  /// The remote peers currently in the room.
  List<RemotePeer> get peers => List<RemotePeer>.unmodifiable(_peers.values);

  /// Inbound peer messages, already unwrapped from their relay frames.
  Stream<WireMessage> get messages => _messages.stream;

  /// Peer join/leave events.
  Stream<RoomfulPeerEvent> get peerEvents => _peerEvents.stream;

  /// Opens the transport, joins the room, and completes once the relay acknowledges the
  /// join with a `joined` frame.
  Future<void> connect() async {
    if (_state == RoomfulConnectionState.connecting ||
        _state == RoomfulConnectionState.connected) {
      return;
    }
    _state = RoomfulConnectionState.connecting;
    await _transport.connect();
    _inboundSub = _transport.inbound.listen(_onInbound);

    final joined = Completer<void>();
    _joined = joined;
    _transport.send(
      jsonEncode(
        buildRelayJoin(roomId: roomId, peerId: peerId, protocol: capabilities),
      ),
    );
    await joined.future;
  }

  /// Broadcasts [message] to the whole room.
  void broadcast(WireMessage message) => _send(message, _defaultSession);

  /// Sends [message] to a single peer, using that peer's negotiated session when known.
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
      _sessionFor(_peers[targetPeerId]),
    );
  }

  /// Leaves the room and closes the transport.
  Future<void> disconnect() async {
    if (_state == RoomfulConnectionState.connected) {
      _transport.send(
        jsonEncode(buildRelayLeave(roomId: roomId, peerId: peerId)),
      );
    }
    await _teardown();
  }

  static const ProtocolSession _defaultSession =
      ProtocolSession(version: 2, codec: 'json', legacy: false);

  ProtocolSession _sessionFor(RemotePeer? peer) {
    final result =
        negotiateSession(capabilities, peer?.protocol, supportsBinary: false);
    return result.session ?? ProtocolSession.legacyV1;
  }

  void _send(WireMessage message, ProtocolSession session) {
    final envelope = buildJsonEnvelope(message, session);
    _transport.send(jsonEncode(buildRelayTransport(envelope)));
  }

  void _onInbound(Object data) {
    if (data is! String) {
      return; // Only JSON relay frames are handled today; MessagePack lands in S05+.
    }
    final Object? decoded = jsonDecode(data);
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
        _joined?.complete();
        _joined = null;
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
