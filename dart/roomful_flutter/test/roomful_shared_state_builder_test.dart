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

Map<String, dynamic> stateFrame(String peerId, Object? value, int timestamp) {
  final message = WireMessage(
    type: 'state:update',
    roomId: 'room-a',
    fromPeerId: peerId,
    timestamp: timestamp,
    payload: <String, dynamic>{
      'value': value,
      'timestamp': timestamp,
      'changedBy': peerId,
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
  testWidgets('RoomfulSharedStateBuilder reflects the room shared value',
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
      fake.emit(stateFrame('js-1', 'hello', 100));
      await Future<void>.delayed(Duration.zero);
    });
    addTearDown(controller.dispose);
    expect(controller.sharedValue, 'hello');

    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: RoomfulSharedStateBuilder<String>(
          controller: controller,
          builder: (context, value, set) => Text(value ?? 'empty'),
        ),
      ),
    );

    expect(find.text('hello'), findsOneWidget);
  });
}
