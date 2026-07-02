import 'dart:async';
import 'dart:convert';

import 'package:roomful/roomful.dart';
import 'package:test/test.dart';

/// A transport under test control: it captures sent frames and lets a test inject inbound
/// relay frames, so the client lifecycle is verified without a network.
class FakeTransport implements RoomfulTransport {
  final List<Object> sent = <Object>[];
  final StreamController<Object> _controller = StreamController<Object>.broadcast();
  bool connected = false;
  bool closed = false;

  @override
  Stream<Object> get inbound => _controller.stream;

  @override
  Future<void> connect() async {
    connected = true;
  }

  @override
  void send(Object frame) => sent.add(frame);

  @override
  Future<void> close() async {
    closed = true;
    await _controller.close();
  }

  void emit(Map<String, dynamic> frame) => _controller.add(jsonEncode(frame));

  List<Map<String, dynamic>> get sentFrames => sent
      .map((s) => jsonDecode(s as String) as Map<String, dynamic>)
      .toList();
}

WireMessage cursor(String from) => WireMessage(
      type: 'cursor:update',
      roomId: 'room-a',
      fromPeerId: from,
      timestamp: 1700000000000,
      payload: <String, dynamic>{
        'cursor': <String, dynamic>{'userId': from, 'x': 0.1},
      },
    );

Future<void> pump() => Future<void>.delayed(Duration.zero);

Future<RoomfulClient> connected(
  FakeTransport fake, {
  List<Map<String, dynamic>> peers = const <Map<String, dynamic>>[],
}) async {
  final client = RoomfulClient(roomId: 'room-a', peerId: 'dart-1', transport: fake);
  final connecting = client.connect();
  await pump();
  fake.emit(<String, dynamic>{
    'type': 'joined',
    'roomId': 'room-a',
    'peerId': 'dart-1',
    'peers': peers,
  });
  await connecting;
  return client;
}

void main() {
  test('connects, joins, and lists existing peers', () async {
    final fake = FakeTransport();
    final client = await connected(
      fake,
      peers: <Map<String, dynamic>>[
        <String, dynamic>{'peerId': 'js-1'},
      ],
    );

    final join = fake.sentFrames.firstWhere((f) => f['type'] == 'join');
    expect(join['roomId'], 'room-a');
    expect(join['peerId'], 'dart-1');
    expect(client.state, RoomfulConnectionState.connected);
    expect(client.peers.map((p) => p.peerId), <String>['js-1']);
  });

  test('tracks peer join and leave', () async {
    final fake = FakeTransport();
    final client = await connected(fake);

    fake.emit(<String, dynamic>{
      'type': 'peer-joined',
      'roomId': 'room-a',
      'peerId': 'js-2',
    });
    await pump();
    expect(client.peers.map((p) => p.peerId), <String>['js-2']);

    fake.emit(<String, dynamic>{
      'type': 'peer-left',
      'roomId': 'room-a',
      'peerId': 'js-2',
    });
    await pump();
    expect(client.peers, isEmpty);
  });

  test('delivers inbound transport frames as messages', () async {
    final fake = FakeTransport();
    final client = await connected(fake);

    final received = <WireMessage>[];
    final sub = client.messages.listen(received.add);

    final envelope = buildJsonEnvelope(
      cursor('js-9'),
      const ProtocolSession(version: 2, codec: 'json', legacy: false),
    );
    fake.emit(<String, dynamic>{'type': 'transport', 'message': envelope});
    await pump();

    expect(received, hasLength(1));
    expect(received.first.type, 'cursor:update');
    expect(received.first.fromPeerId, 'js-9');
    await sub.cancel();
  });

  test('broadcast sends a wrapped transport frame; disconnect leaves and closes', () async {
    final fake = FakeTransport();
    final client = await connected(fake);

    client.broadcast(cursor('dart-1'));
    final transportFrame =
        fake.sentFrames.firstWhere((f) => f['type'] == 'transport');
    expect((transportFrame['message'] as Map<String, dynamic>)['type'], 'cursor:update');

    await client.disconnect();
    expect(fake.sentFrames.any((f) => f['type'] == 'leave'), isTrue);
    expect(fake.closed, isTrue);
    expect(client.state, RoomfulConnectionState.disconnected);
  });
}
