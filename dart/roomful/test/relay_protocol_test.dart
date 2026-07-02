import 'package:roomful/roomful.dart';
import 'package:test/test.dart';

void main() {
  group('relay client frames', () {
    test('join carries protocol capabilities', () {
      final caps = ProtocolCapabilities.create(<String>['json', 'msgpack'], 'msgpack');
      final frame = buildRelayJoin(roomId: 'r', peerId: 'p', protocol: caps);

      expect(frame['type'], 'join');
      expect(frame['roomId'], 'r');
      expect(frame['peerId'], 'p');
      expect((frame['protocol'] as Map<String, dynamic>)['preferredCodec'], 'msgpack');
    });

    test('transport wraps a peer envelope', () {
      final envelope = <String, dynamic>{'source': 'roomful', 'type': 'event'};
      final frame = buildRelayTransport(envelope);

      expect(frame['type'], 'transport');
      expect(frame['message'], same(envelope));
    });
  });

  group('relay server frames', () {
    test('parses joined with its peer list', () {
      final frame = parseRelayServerFrame(<String, dynamic>{
        'type': 'joined',
        'roomId': 'r',
        'peerId': 'p',
        'peers': <Map<String, dynamic>>[
          <String, dynamic>{'peerId': 'a'},
          <String, dynamic>{
            'peerId': 'b',
            'protocol': ProtocolCapabilities.create(<String>['json'], 'json').toJson(),
          },
        ],
      });

      expect(frame, isA<RelayJoined>());
      final joined = frame! as RelayJoined;
      expect(joined.peers.map((p) => p.peerId), <String>['a', 'b']);
      expect(joined.peers[1].protocol?.preferredCodec, 'json');
    });

    test('parses peer-joined, peer-left, and error', () {
      expect(
        parseRelayServerFrame(<String, dynamic>{
          'type': 'peer-joined',
          'roomId': 'r',
          'peerId': 'x',
        }),
        isA<RelayPeerJoined>(),
      );
      expect(
        parseRelayServerFrame(<String, dynamic>{
          'type': 'peer-left',
          'roomId': 'r',
          'peerId': 'x',
        }),
        isA<RelayPeerLeft>(),
      );
      expect(
        parseRelayServerFrame(<String, dynamic>{
          'type': 'error',
          'code': 'ROOM_FULL',
          'message': 'full',
        }),
        isA<RelayErrorFrame>(),
      );
    });

    test('returns null for an unrecognized frame', () {
      expect(parseRelayServerFrame(<String, dynamic>{'type': 'nope'}), isNull);
    });
  });
}
