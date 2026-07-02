import 'dart:async';
import 'dart:convert';

import 'package:roomful/roomful.dart';
import 'package:test/test.dart';

/// A transport that can be "dropped" (its inbound stream closed) and re-opened, so the client's
/// auto-reconnect can be exercised without a network.
class ReconnectFakeTransport implements RoomfulTransport {
  final List<Object> sent = <Object>[];
  StreamController<Object> _inbound = StreamController<Object>.broadcast();
  int connectCount = 0;

  @override
  Stream<Object> get inbound => _inbound.stream;

  @override
  Future<void> connect() async {
    connectCount++;
    if (_inbound.isClosed) {
      _inbound = StreamController<Object>.broadcast();
    }
  }

  @override
  void send(Object frame) => sent.add(frame);

  @override
  Future<void> close() async {
    if (!_inbound.isClosed) {
      await _inbound.close();
    }
  }

  void emit(Map<String, dynamic> frame) {
    if (!_inbound.isClosed) {
      _inbound.add(jsonEncode(frame));
    }
  }

  /// Simulate the socket dropping (closes the current inbound stream).
  Future<void> drop() async {
    if (!_inbound.isClosed) {
      await _inbound.close();
    }
  }

  List<Map<String, dynamic>> get sentFrames => sent
      .map((s) => jsonDecode(s as String) as Map<String, dynamic>)
      .toList();
}

Map<String, dynamic> _joined() => <String, dynamic>{
      'type': 'joined',
      'roomId': 'room-a',
      'peerId': 'dart-1',
      'peers': <Map<String, dynamic>>[],
    };

Future<void> _tick([int ms = 0]) =>
    Future<void>.delayed(Duration(milliseconds: ms));

Future<RoomfulClient> _connected(
  ReconnectFakeTransport fake, {
  RoomfulReconnect? reconnect,
}) async {
  final client = RoomfulClient(
    roomId: 'room-a',
    peerId: 'dart-1',
    transport: fake,
    reconnect: reconnect,
  );
  final connecting = client.connect();
  await _tick();
  fake.emit(_joined());
  await connecting;
  return client;
}

void main() {
  test('auto-reconnects after a drop, re-joins, and fires the reconnect hook',
      () async {
    final fake = ReconnectFakeTransport();
    final client = await _connected(
      fake,
      reconnect: const RoomfulReconnect(initialDelay: Duration(milliseconds: 10)),
    );
    expect(client.state, RoomfulConnectionState.connected);
    expect(fake.connectCount, 1);

    final reconnected = <void>[];
    final sub = client.reconnects.listen(reconnected.add);

    await fake.drop();
    await _tick(40);
    expect(fake.connectCount, 2);
    expect(client.state, RoomfulConnectionState.connecting);

    // The relay acknowledges the re-join.
    fake.emit(_joined());
    await _tick();
    expect(client.state, RoomfulConnectionState.connected);
    expect(reconnected, hasLength(1));

    await sub.cancel();
    await client.disconnect();
  });

  test('re-announces presence after a reconnect', () async {
    final fake = ReconnectFakeTransport();
    final client = await _connected(
      fake,
      reconnect: const RoomfulReconnect(initialDelay: Duration(milliseconds: 10)),
    );
    final presence = PresenceEngine(client);

    presence.set(<String, dynamic>{'name': 'Alice'});
    final sentBeforeDrop = fake.sent.length;

    await fake.drop();
    await _tick(40);
    fake.emit(_joined());
    await _tick();

    final afterDrop = fake.sentFrames.sublist(sentBeforeDrop);
    final reannounced = afterDrop.where((frame) {
      if (frame['type'] != 'transport') {
        return false;
      }
      final message = frame['message'] as Map<String, dynamic>;
      return message['type'] == 'presence:update';
    });
    expect(reannounced, isNotEmpty);

    await presence.dispose();
    await client.disconnect();
  });

  test('without a reconnect policy, a drop leaves the client disconnected',
      () async {
    final fake = ReconnectFakeTransport();
    final client = await _connected(fake);

    await fake.drop();
    await _tick(20);
    expect(fake.connectCount, 1);
    expect(client.state, RoomfulConnectionState.disconnected);

    await client.disconnect();
  });
}
