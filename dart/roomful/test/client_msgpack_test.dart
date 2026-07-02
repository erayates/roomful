import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:roomful/roomful.dart';
import 'package:test/test.dart';

/// A transport that records sent frames (as their real runtime type — String for JSON, Uint8List
/// for msgpack) and lets a test inject inbound frames.
class FakeTransport implements RoomfulTransport {
  final List<Object> sent = <Object>[];
  final StreamController<Object> _controller =
      StreamController<Object>.broadcast();

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

  void emit(Object frame) => _controller.add(frame);
}

const ProtocolSession _msgpackSession =
    ProtocolSession(version: 2, codec: 'msgpack', legacy: false);

ProtocolCapabilities _msgpackCaps() =>
    ProtocolCapabilities.create(<String>['json', 'msgpack'], 'msgpack');

WireMessage _cursor(String from) => WireMessage(
      type: 'cursor:update',
      roomId: 'room-a',
      fromPeerId: from,
      timestamp: 1700000000000,
      payload: <String, dynamic>{
        'cursor': <String, dynamic>{'userId': from, 'x': 0.1},
      },
    );

Future<void> _pump() => Future<void>.delayed(Duration.zero);

String _joinedFrame() => jsonEncode(<String, dynamic>{
      'type': 'joined',
      'roomId': 'room-a',
      'peerId': 'dart-1',
      'peers': <Map<String, dynamic>>[],
    });

Future<RoomfulClient> _connected(
  FakeTransport fake, {
  ProtocolCapabilities? capabilities,
  bool supportsBinary = false,
}) async {
  final client = RoomfulClient(
    roomId: 'room-a',
    peerId: 'dart-1',
    transport: fake,
    capabilities: capabilities,
    supportsBinary: supportsBinary,
  );
  final connecting = client.connect();
  await _pump();
  // Control frames stay JSON even for a msgpack session.
  fake.emit(_joinedFrame());
  await connecting;
  return client;
}

void main() {
  test('a binary msgpack client sends binary transport frames', () async {
    final fake = FakeTransport();
    final client = await _connected(
      fake,
      capabilities: _msgpackCaps(),
      supportsBinary: true,
    );

    // The join is a JSON control frame; the transport frame is msgpack bytes.
    expect(fake.sent.first, isA<String>());
    client.broadcast(_cursor('dart-1'));

    final binary = fake.sent.whereType<Uint8List>().toList();
    expect(binary, hasLength(1));
    final wrapper = decodeMsgpackFrame(binary.first) as Map<String, dynamic>;
    expect(wrapper['type'], 'transport');
    final envelope = wrapper['message'] as Map<String, dynamic>;
    expect(envelope['type'], 'cursor:update');
    expect(envelope['protocolVersion'], 2);
    expect(envelope['codec'], 'msgpack');

    await client.disconnect();
  });

  test('a binary msgpack client decodes inbound binary transport frames',
      () async {
    final fake = FakeTransport();
    final client = await _connected(
      fake,
      capabilities: _msgpackCaps(),
      supportsBinary: true,
    );

    final received = <WireMessage>[];
    final sub = client.messages.listen(received.add);

    final frame =
        buildRelayTransport(buildJsonEnvelope(_cursor('js-9'), _msgpackSession));
    fake.emit(encodeMsgpackFrame(frame));
    await _pump();

    expect(received, hasLength(1));
    expect(received.first.type, 'cursor:update');
    expect(received.first.fromPeerId, 'js-9');

    await sub.cancel();
    await client.disconnect();
  });

  test('a json client still sends json transport frames', () async {
    final fake = FakeTransport();
    final client = await _connected(fake);

    client.broadcast(_cursor('dart-1'));

    expect(fake.sent.whereType<Uint8List>(), isEmpty);
    // join + transport, both JSON strings.
    expect(fake.sent.whereType<String>().length, greaterThanOrEqualTo(2));

    await client.disconnect();
  });
}
