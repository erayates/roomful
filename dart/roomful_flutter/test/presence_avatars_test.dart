import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roomful_flutter/roomful_flutter.dart';

class FakeTransport implements RoomfulTransport {
  final StreamController<Object> _controller =
      StreamController<Object>.broadcast();

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

void main() {
  testWidgets('PresenceAvatars shows a chip per peer with presence',
      (tester) async {
    final fake = FakeTransport();
    late final RoomController controller;

    // Build and drive the controller in one real-async zone so the client's stream propagation
    // runs to completion (the tester's fake clock would otherwise freeze it). Presence is fully
    // populated before the widget mounts, so the first build renders it.
    await tester.runAsync(() async {
      controller = RoomController(
        RoomfulClient(roomId: 'room-a', peerId: 'me', transport: fake),
      );
      final connecting = controller.connect();
      await Future<void>.delayed(Duration.zero);
      fake.emit(<String, dynamic>{
        'type': 'joined',
        'roomId': 'room-a',
        'peerId': 'me',
        'peers': <Map<String, dynamic>>[
          <String, dynamic>{'peerId': 'js-1'},
        ],
      });
      await connecting;
      fake.emit(presenceFrame('js-1', <String, dynamic>{'name': 'Alice'}));
      await Future<void>.delayed(Duration.zero);
    });
    addTearDown(controller.dispose);
    expect(controller.presence.remote['js-1']?['name'], 'Alice');

    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: PresenceAvatars(controller: controller, includeSelf: false),
      ),
    );

    // "Alice" -> "AL".
    expect(find.text('AL'), findsOneWidget);
  });
}
