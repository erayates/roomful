import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:roomful_flutter/roomful_flutter.dart';

class FakeTransport implements RoomfulTransport {
  final StreamController<Object> _controller = StreamController<Object>.broadcast();

  @override
  Stream<Object> get inbound => _controller.stream;

  @override
  Future<void> connect() async {}

  @override
  void send(Object frame) {}

  @override
  Future<void> close() async {
    await _controller.close();
  }

  void emit(Map<String, dynamic> frame) => _controller.add(jsonEncode(frame));
}

Map<String, dynamic> presenceFrame(String peerId, Map<String, dynamic> data) {
  final message = WireMessage(
    type: 'presence:update',
    roomId: 'room-a',
    fromPeerId: peerId,
    timestamp: 1,
    payload: <String, dynamic>{
      'peer': <String, dynamic>{'id': peerId, ...data},
    },
  );
  return <String, dynamic>{
    'type': 'transport',
    'message': buildJsonEnvelope(
      message,
      const ProtocolSession(version: 2, codec: 'json', legacy: false),
    ),
  };
}

Future<void> pump() => Future<void>.delayed(Duration.zero);

void main() {
  test('RoomController connects, lists peers, and notifies on presence', () async {
    final fake = FakeTransport();
    final controller = RoomController(
      RoomfulClient(roomId: 'room-a', peerId: 'dart-1', transport: fake),
    );
    var notifications = 0;
    controller.addListener(() => notifications++);

    final connecting = controller.connect();
    await pump();
    fake.emit(<String, dynamic>{
      'type': 'joined',
      'roomId': 'room-a',
      'peerId': 'dart-1',
      'peers': <Map<String, dynamic>>[
        <String, dynamic>{'peerId': 'js-1'},
      ],
    });
    await connecting;
    expect(controller.state, RoomfulConnectionState.connected);
    expect(controller.peers.map((p) => p.peerId), <String>['js-1']);

    fake.emit(presenceFrame('js-1', <String, dynamic>{'name': 'Alice'}));
    await pump();
    expect(controller.presence.remote['js-1']?['name'], 'Alice');
    expect(notifications, greaterThan(0));

    controller.dispose();
  });
}
