// Demonstrates the `v2.1-alpha` scaffold: capability negotiation and envelope
// encode/decode. Run with `dart run example/roomful_example.dart`.

import 'package:roomful/roomful.dart';

void main() {
  // Two peers advertise capabilities and negotiate a session.
  final local = ProtocolCapabilities.create(['json', 'msgpack'], 'msgpack');
  final remote = ProtocolCapabilities.create(['json', 'msgpack'], 'msgpack');
  final negotiation = negotiateSession(local, remote, supportsBinary: true);
  print('negotiated: ${negotiation.session?.toJson()} (${negotiation.reason})');

  // Encode a cursor update, then decode it back.
  final session = negotiation.session ?? ProtocolSession.legacyV1;
  final jsonSession = ProtocolSession(
    version: session.version,
    codec: 'json',
    legacy: session.legacy,
  );
  final message = WireMessage(
    type: 'cursor:update',
    roomId: 'room-a',
    fromPeerId: 'peer-a',
    timestamp: DateTime.now().millisecondsSinceEpoch,
    payload: <String, dynamic>{
      'cursor': <String, dynamic>{
        'userId': 'peer-a',
        'name': 'Alice',
        'color': '#5cc7ab',
        'x': 0.5,
        'y': 0.25,
        'xAbsolute': 640,
        'yAbsolute': 360,
        'idle': false,
      },
    },
  );

  final wire = encodeJsonEnvelope(message, jsonSession);
  print('wire: $wire');
  final decoded = decodeJsonEnvelope(wire);
  print('decoded ${decoded.type} from ${decoded.fromPeerId}');
}
