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
  testWidgets('PresenceAvatars shows a chip per peer and reacts to presence',
      (tester) async {
    final fake = FakeTransport();
    final controller = RoomController(
      RoomfulClient(roomId: 'room-a', peerId: 'me', transport: fake),
    );
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: PresenceAvatars(controller: controller, includeSelf: false),
      ),
    );
    // Nothing to show before anyone has presence.
    expect(find.byType(Text), findsNothing);

    unawaited(controller.connect());
    await tester.pump();
    fake.emit(<String, dynamic>{
      'type': 'joined',
      'roomId': 'room-a',
      'peerId': 'me',
      'peers': <Map<String, dynamic>>[
        <String, dynamic>{'peerId': 'js-1'},
      ],
    });
    await tester.pump();
    fake.emit(presenceFrame('js-1', <String, dynamic>{'name': 'Alice'}));
    await tester.pump();

    // "Alice" -> "AL".
    expect(find.text('AL'), findsOneWidget);
  });
}
