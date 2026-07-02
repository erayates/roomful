// A console demo of the room primitives: presence, events, and shared state. It needs a
// running Roomful relay — set the URL below — and prints updates as peers interact.
//
// Run with `dart run example/room_example.dart` against a relay.

import 'package:roomful/roomful.dart';

Future<void> main() async {
  final transport = WebSocketRelayTransport('wss://relay.example/?room=demo');
  final client = RoomfulClient(
    roomId: 'demo',
    peerId: 'dart-1',
    transport: transport,
    capabilities: ProtocolCapabilities.create(<String>['json'], 'json'),
  );

  final presence = PresenceEngine(client);
  final events = EventEngine(client);
  final state = SharedStateEngine(client);

  presence.changes.listen((remote) => print('presence: ${remote.keys.toList()}'));
  events.on('ping', (payload) => print('ping: $payload'));
  state.changes.listen((value) => print('state: $value'));

  await client.connect();
  print('joined; peers: ${client.peers.map((p) => p.peerId).toList()}');

  presence.set(<String, dynamic>{'name': 'Alice', 'color': '#5cc7ab'});
  events.emit('ping', <String, dynamic>{'from': 'dart-1'});
  state.set(<String, dynamic>{'count': 1});

  await Future<void>.delayed(const Duration(seconds: 5));
  await client.disconnect();
}
