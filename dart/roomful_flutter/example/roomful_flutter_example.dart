import 'package:flutter/material.dart';
import 'package:roomful_flutter/roomful_flutter.dart';

/// A small end-to-end example wiring the whole `roomful_flutter` surface together: a
/// [RoomfulProvider] hosting [PresenceAvatars], a [LiveCursorsOverlay] canvas, and a shared
/// counter via [RoomfulSharedStateBuilder].
///
/// Defaults to the same relay and room as the React `examples/cross-platform-interop` client, so
/// the two collaborate across platforms. Start a relay (`docker compose up`) and run:
///
/// ```sh
/// flutter run -t example/roomful_flutter_example.dart \
///   --dart-define=ROOMFUL_RELAY_URL=ws://<your-host>:8787
/// ```
void main() {
  runApp(const RoomfulExampleApp());
}

// Shared with the React interop client so both join the same room; override the relay for a device
// (localhost is not reachable from a phone) with --dart-define=ROOMFUL_RELAY_URL=ws://<host>:8787.
const String _roomId =
    String.fromEnvironment('ROOMFUL_ROOM', defaultValue: 'roomful-interop-demo');
const String _relayUrl = String.fromEnvironment(
  'ROOMFUL_RELAY_URL',
  defaultValue: 'ws://localhost:8787',
);

class RoomfulExampleApp extends StatelessWidget {
  const RoomfulExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Roomful × Flutter',
      theme: ThemeData.dark(),
      home: const _ExampleHome(name: 'Flutter User', color: '#5cc7ab'),
    );
  }
}

class _ExampleHome extends StatelessWidget {
  const _ExampleHome({required this.name, required this.color});

  final String name;
  final String color;

  @override
  Widget build(BuildContext context) {
    return RoomfulProvider(
      roomId: _roomId,
      peerId: 'flutter-${identityHashCode(this)}',
      relayUrl: _relayUrl,
      child: _RoomScreen(name: name, color: color),
    );
  }
}

class _RoomScreen extends StatefulWidget {
  const _RoomScreen({required this.name, required this.color});

  final String name;
  final String color;

  @override
  State<_RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<_RoomScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      RoomfulProvider.of(context).setPresence(<String, dynamic>{
        'name': widget.name,
        'color': widget.color,
      });
    });
  }

  void _publishCursor(RoomController room, Offset local, BoxConstraints box) {
    if (box.maxWidth == 0 || box.maxHeight == 0) {
      return;
    }
    // setPosition fills the relay-required cursor fields; a bare {x, y} map would be dropped.
    room.cursors.setPosition(
      local.dx / box.maxWidth,
      local.dy / box.maxHeight,
      name: widget.name,
      color: widget.color,
      xAbsolute: local.dx,
      yAbsolute: local.dy,
    );
  }

  @override
  Widget build(BuildContext context) {
    final room = RoomfulProvider.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Roomful × Flutter'),
        actions: const <Widget>[
          Padding(
            padding: EdgeInsets.only(right: 12),
            child: Center(child: PresenceAvatars()),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.all(12),
            child: RoomfulBuilder(
              builder: (context, room) => Text(
                '${room.peers.length} other peer(s) • ${room.state.name}',
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: RoomfulSharedStateBuilder<int>(
              builder: (context, value, set) {
                final count = value ?? 0;
                return Row(
                  children: <Widget>[
                    Text('Shared counter: $count'),
                    const SizedBox(width: 12),
                    ElevatedButton(
                      onPressed: () => set(count + 1),
                      child: const Text('+1'),
                    ),
                  ],
                );
              },
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return Listener(
                  onPointerHover: (event) =>
                      _publishCursor(room, event.localPosition, constraints),
                  onPointerMove: (event) =>
                      _publishCursor(room, event.localPosition, constraints),
                  child: LiveCursorsOverlay(
                    normalized: true,
                    child: Container(
                      color: const Color(0xFF0A0F0E),
                      alignment: Alignment.center,
                      child: const Text('Move your cursor here'),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
