import 'protocol.dart';

/// The relay control protocol (RFC-0001 "relay control layer"): the frames a client and a
/// Roomful relay exchange around the peer transport envelope. Mirrors `@roomful/relay`.

/// A peer as reported by the relay in `joined` / `peer-joined`.
class RelayPeer {
  const RelayPeer({required this.peerId, this.protocol});

  final String peerId;
  final ProtocolCapabilities? protocol;
}

/// Builds a relay `join` frame.
Map<String, dynamic> buildRelayJoin({
  required String roomId,
  required String peerId,
  ProtocolCapabilities? protocol,
  int? maxPeers,
  String? token,
}) =>
    <String, dynamic>{
      'type': 'join',
      'roomId': roomId,
      'peerId': peerId,
      if (protocol != null) 'protocol': protocol.toJson(),
      if (maxPeers != null) 'maxPeers': maxPeers,
      if (token != null) 'token': token,
    };

/// Builds a relay `leave` frame.
Map<String, dynamic> buildRelayLeave({
  required String roomId,
  required String peerId,
}) =>
    <String, dynamic>{'type': 'leave', 'roomId': roomId, 'peerId': peerId};

/// Wraps a peer transport [envelope] in a relay `transport` frame.
Map<String, dynamic> buildRelayTransport(Map<String, dynamic> envelope) =>
    <String, dynamic>{'type': 'transport', 'message': envelope};

/// A frame received from the relay.
sealed class RelayServerFrame {
  const RelayServerFrame();
}

/// Acknowledges a join and lists the peers already in the room.
class RelayJoined extends RelayServerFrame {
  const RelayJoined({
    required this.roomId,
    required this.peerId,
    required this.peers,
  });

  final String roomId;
  final String peerId;
  final List<RelayPeer> peers;
}

/// A peer joined the room.
class RelayPeerJoined extends RelayServerFrame {
  const RelayPeerJoined({
    required this.roomId,
    required this.peerId,
    this.protocol,
  });

  final String roomId;
  final String peerId;
  final ProtocolCapabilities? protocol;
}

/// A peer left the room.
class RelayPeerLeft extends RelayServerFrame {
  const RelayPeerLeft({required this.roomId, required this.peerId});

  final String roomId;
  final String peerId;
}

/// Carries a peer transport envelope forwarded by the relay.
class RelayTransportFrame extends RelayServerFrame {
  const RelayTransportFrame({required this.message});

  final Map<String, dynamic> message;
}

/// A relay error.
class RelayErrorFrame extends RelayServerFrame {
  const RelayErrorFrame({required this.code, required this.message});

  final String code;
  final String message;
}

ProtocolCapabilities? _parseProtocol(Object? value) =>
    value is Map<String, dynamic> ? ProtocolCapabilities.fromJson(value) : null;

RelayPeer _parseRelayPeer(Map<String, dynamic> value) => RelayPeer(
      peerId: value['peerId'] as String,
      protocol: _parseProtocol(value['protocol']),
    );

/// Parses a decoded relay server frame, or `null` when the frame is unrecognized.
RelayServerFrame? parseRelayServerFrame(Map<String, dynamic> frame) {
  switch (frame['type']) {
    case 'joined':
      final peers = (frame['peers'] as List<dynamic>)
          .map((dynamic p) => _parseRelayPeer(p as Map<String, dynamic>))
          .toList();
      return RelayJoined(
        roomId: frame['roomId'] as String,
        peerId: frame['peerId'] as String,
        peers: peers,
      );
    case 'peer-joined':
      return RelayPeerJoined(
        roomId: frame['roomId'] as String,
        peerId: frame['peerId'] as String,
        protocol: _parseProtocol(frame['protocol']),
      );
    case 'peer-left':
      return RelayPeerLeft(
        roomId: frame['roomId'] as String,
        peerId: frame['peerId'] as String,
      );
    case 'transport':
      return RelayTransportFrame(
        message: frame['message'] as Map<String, dynamic>,
      );
    case 'error':
      return RelayErrorFrame(
        code: frame['code'] as String,
        message: frame['message'] as String,
      );
    default:
      return null;
  }
}
