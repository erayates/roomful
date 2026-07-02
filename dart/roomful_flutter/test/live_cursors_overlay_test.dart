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

Map<String, dynamic> _frame(WireMessage message) {
  return <String, dynamic>{
    'type': 'transport',
    'message': buildJsonEnvelope(
      message,
      const ProtocolSession(version: 2, codec: 'json', legacy: false),
    ),
  };
}

Map<String, dynamic> presenceFrame(String peerId, Map<String, dynamic> data) {
  return _frame(
    WireMessage(
      type: 'presence:update',
      roomId: 'room-a',
      fromPeerId: peerId,
      timestamp: 1,
      payload: <String, dynamic>{
        'peer': <String, dynamic>{'id': peerId, ...data},
      },
    ),
  );
}

Map<String, dynamic> cursorFrame(String peerId, Map<String, dynamic> cursor) {
  return _frame(
    WireMessage(
      type: 'cursor:update',
      roomId: 'room-a',
      fromPeerId: peerId,
      timestamp: 2,
      payload: <String, dynamic>{'cursor': cursor},
    ),
  );
}

void main() {
  testWidgets('LiveCursorsOverlay renders a labelled pointer per remote cursor',
      (tester) async {
    final fake = FakeTransport();
    late final RoomController controller;

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
      fake.emit(presenceFrame('js-1', <String, dynamic>{'name': 'Bob'}));
      await Future<void>.delayed(Duration.zero);
      fake.emit(cursorFrame('js-1', <String, dynamic>{'x': 20.0, 'y': 30.0}));
      await Future<void>.delayed(Duration.zero);
    });
    addTearDown(controller.dispose);
    expect(controller.cursors.remote['js-1']?['x'], 20);

    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: LiveCursorsOverlay(
          controller: controller,
          child: const SizedBox(width: 200, height: 200),
        ),
      ),
    );

    expect(find.text('Bob'), findsOneWidget);
    expect(find.byType(CustomPaint), findsWidgets);
  });
}
