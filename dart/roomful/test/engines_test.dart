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

WireMessage lockEvent(String name, String key, String peerId, int timestamp) =>
    WireMessage(
      type: 'event',
      roomId: 'room-a',
      fromPeerId: peerId,
      timestamp: timestamp,
      payload: <String, dynamic>{
        'name': name,
        'payload': <String, dynamic>{
          'key': key,
          'peerId': peerId,
          'timestamp': timestamp,
        },
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

    test('broadcasts a relay-conformant peer with id, joinedAt, and lastSeen',
        () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      PresenceEngine(client).set(<String, dynamic>{'name': 'Alice'});

      final frame = fake.sentFrames.lastWhere((f) => f['type'] == 'transport');
      final envelope = frame['message'] as Map<String, dynamic>;
      expect(envelope['type'], 'presence:update');
      final peer =
          (envelope['payload'] as Map<String, dynamic>)['peer'] as Map<String, dynamic>;
      expect(peer['id'], 'dart-1');
      expect(peer['name'], 'Alice');
      expect(peer['joinedAt'], isA<int>());
      expect(peer['lastSeen'], isA<int>());
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

  group('CursorsEngine', () {
    test('tracks remote cursors and clears them on leave', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      final cursors = CursorsEngine(client);

      fake.emit(<String, dynamic>{
        'type': 'peer-joined',
        'roomId': 'room-a',
        'peerId': 'js-1',
      });
      await pump();

      fake.emit(transportFrame(WireMessage(
        type: 'cursor:update',
        roomId: 'room-a',
        fromPeerId: 'js-1',
        timestamp: 1,
        payload: <String, dynamic>{
          'cursor': <String, dynamic>{'userId': 'js-1', 'x': 0.5},
        },
      )));
      await pump();
      expect(cursors.remote['js-1']?['x'], 0.5);

      fake.emit(<String, dynamic>{
        'type': 'peer-left',
        'roomId': 'room-a',
        'peerId': 'js-1',
      });
      await pump();
      expect(cursors.remote.containsKey('js-1'), isFalse);
    });

    test('setPosition emits a relay-conformant cursor', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      CursorsEngine(client).setPosition(0.5, 0.25, name: 'Alice', color: '#5cc7ab');

      final frame = fake.sentFrames.lastWhere((f) => f['type'] == 'transport');
      final envelope = frame['message'] as Map<String, dynamic>;
      expect(envelope['type'], 'cursor:update');
      final cursor =
          (envelope['payload'] as Map<String, dynamic>)['cursor'] as Map<String, dynamic>;
      expect(cursor['userId'], 'dart-1');
      expect(cursor['name'], 'Alice');
      expect(cursor['color'], '#5cc7ab');
      expect(cursor['x'], 0.5);
      expect(cursor['y'], 0.25);
      expect(cursor['xAbsolute'], isA<num>());
      expect(cursor['yAbsolute'], isA<num>());
      expect(cursor['idle'], isFalse);
    });
  });

  group('LocksEngine', () {
    test('resolves the holder by earliest claim; release hands it over', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      final locks = LocksEngine(client);

      // A remote peer claims the lock earlier than our later claim.
      fake.emit(transportFrame(lockEvent('roomful:lock:acquire', 'row-1', 'js-1', 5)));
      await pump();
      expect(locks.holder('row-1'), 'js-1');

      locks.acquire('row-1');
      expect(locks.holder('row-1'), 'js-1');
      expect(locks.isHeldByMe('row-1'), isFalse);

      // The earlier holder releases, so our claim wins.
      fake.emit(transportFrame(lockEvent('roomful:lock:release', 'row-1', 'js-1', 6)));
      await pump();
      expect(locks.holder('row-1'), 'dart-1');
      expect(locks.isHeldByMe('row-1'), isTrue);
    });

    test('acquireBlocking resolves immediately when the lock is free', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      final locks = LocksEngine(client);

      expect(await locks.acquireBlocking('row-1'), isTrue);
      expect(locks.isHeldByMe('row-1'), isTrue);
    });

    test('acquireBlocking waits for an earlier holder to release', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      final locks = LocksEngine(client);

      // A remote peer already holds it (earlier claim).
      fake.emit(transportFrame(lockEvent('roomful:lock:acquire', 'row-1', 'js-1', 5)));
      await pump();

      final pending =
          locks.acquireBlocking('row-1', timeout: const Duration(seconds: 5));
      expect(locks.isHeldByMe('row-1'), isFalse);

      // The earlier holder releases; our pending claim wins.
      fake.emit(transportFrame(lockEvent('roomful:lock:release', 'row-1', 'js-1', 6)));
      expect(await pending, isTrue);
      expect(locks.isHeldByMe('row-1'), isTrue);
    });

    test('acquireBlocking times out and retracts the claim', () async {
      final fake = FakeTransport();
      final client = await connectClient(fake);
      final locks = LocksEngine(client);

      // A remote peer holds it earlier and never releases.
      fake.emit(transportFrame(lockEvent('roomful:lock:acquire', 'row-1', 'js-1', 5)));
      await pump();

      final acquired = await locks.acquireBlocking(
        'row-1',
        timeout: const Duration(milliseconds: 20),
      );
      expect(acquired, isFalse);
      // The local claim was retracted; the earlier holder still owns it.
      expect(locks.holder('row-1'), 'js-1');
      expect(locks.isHeldByMe('row-1'), isFalse);
    });
  });
}
