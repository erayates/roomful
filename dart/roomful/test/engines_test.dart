import 'dart:async';
import 'dart:convert';

import 'package:roomful/roomful.dart';
import 'package:test/test.dart';

class FakeTransport implements RoomfulTransport {
  final List<Object> sent = <Object>[];
  final StreamController<Object> _controller = StreamController<Object>.broadcast();

  @override
  Stream<Object> get inbound => _controller.stream;

  @override
  Future<void> connect() async {}

  @override
  void send(Object frame) => sent.add(frame);

  @override
  Future<void> close() async {
    await _controller.close();
  }

  void emit(Map<String, dynamic> frame) => _controller.add(jsonEncode(frame));

  List<Map<String, dynamic>> get sentFrames =>
      sent.map((s) => jsonDecode(s as String) as Map<String, dynamic>).toList();
}

Future<void> pump() => Future<void>.delayed(Duration.zero);

Future<RoomfulClient> connectClient(FakeTransport fake) async {
  final client = RoomfulClient(roomId: 'room-a', peerId: 'dart-1', transport: fake);
  final connecting = client.connect();
  await pump();
  fake.emit(<String, dynamic>{
    'type': 'joined',
    'roomId': 'room-a',
    'peerId': 'dart-1',
    'peers': <Map<String, dynamic>>[],
  });
  await connecting;
  return client;
}

const ProtocolSession _jsonSession =
    ProtocolSession(version: 2, codec: 'json', legacy: false);

Map<String, dynamic> transportFrame(WireMessage message) => <String, dynamic>{
      'type': 'transport',
      'message': buildJsonEnvelope(message, _jsonSession),
    };

WireMessage stateMessage(String from, Object? value, int timestamp) => WireMessage(
      type: 'state:update',
      roomId: 'room-a',
      fromPeerId: from,
      timestamp: timestamp,
      payload: <String, dynamic>{
        'value': value,
        'history': <dynamic>[],
        'vectorClock': <String, dynamic>{from: timestamp},
        'changedBy': from,
        'timestamp': timestamp,
        'reason': 'set',
      },
    );

void main() {
  group('EventEngine', () {
    test('dispatches inbound events to handlers by name', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      final events = EventEngine(client);
      final received = <Object?>[];
      events.on('ping', received.add);

      fake.emit(transportFrame(WireMessage(
        type: 'event',
        roomId: 'room-a',
        fromPeerId: 'js-1',
        timestamp: 1,
        payload: <String, dynamic>{
          'name': 'ping',
          'payload': <String, dynamic>{'n': 1},
        },
      )));
      await pump();

      expect(received, <Object?>[
        <String, dynamic>{'n': 1},
      ]);
    });

    test('emit broadcasts an event transport frame', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      EventEngine(client).emit('hello', 'world');

      final frame = fake.sentFrames.lastWhere((f) => f['type'] == 'transport');
      final envelope = frame['message'] as Map<String, dynamic>;
      expect(envelope['type'], 'event');
      expect((envelope['payload'] as Map<String, dynamic>)['name'], 'hello');
    });
  });

  group('PresenceEngine', () {
    test('tracks remote presence and clears it on leave', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      final presence = PresenceEngine(client);

      // A peer joins the room, publishes presence, then leaves.
      fake.emit(<String, dynamic>{
        'type': 'peer-joined',
        'roomId': 'room-a',
        'peerId': 'js-1',
      });
      await pump();

      fake.emit(transportFrame(WireMessage(
        type: 'presence:update',
        roomId: 'room-a',
        fromPeerId: 'js-1',
        timestamp: 1,
        payload: <String, dynamic>{
          'peer': <String, dynamic>{'id': 'js-1', 'name': 'Alice'},
        },
      )));
      await pump();
      expect(presence.remote['js-1']?['name'], 'Alice');

      fake.emit(<String, dynamic>{
        'type': 'peer-left',
        'roomId': 'room-a',
        'peerId': 'js-1',
      });
      await pump();
      expect(presence.remote.containsKey('js-1'), isFalse);
    });
  });

  group('SharedStateEngine', () {
    test('applies newer writes and ignores older ones (LWW)', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      final state = SharedStateEngine(client);

      fake.emit(transportFrame(stateMessage('js-1', <String, dynamic>{'count': 1}, 10)));
      await pump();
      expect(state.value, <String, dynamic>{'count': 1});

      // Older timestamp is ignored.
      fake.emit(transportFrame(stateMessage('js-1', <String, dynamic>{'count': 99}, 5)));
      await pump();
      expect(state.value, <String, dynamic>{'count': 1});

      // Newer timestamp wins.
      fake.emit(transportFrame(stateMessage('js-2', <String, dynamic>{'count': 2}, 20)));
      await pump();
      expect(state.value, <String, dynamic>{'count': 2});
    });
  });
}
