import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:roomful/roomful.dart';

import 'room_controller.dart';

/// Manages a Roomful room's lifecycle for a widget subtree and exposes its [RoomController].
///
/// It connects on mount over a [WebSocketRelayTransport] to [relayUrl] and disconnects on
/// dispose. Read the controller with `RoomfulProvider.of(context)`; widgets that depend on it
/// rebuild when the room changes.
class RoomfulProvider extends StatefulWidget {
  const RoomfulProvider({
    required this.roomId,
    required this.peerId,
    required this.relayUrl,
    required this.child,
    super.key,
  });

  /// The room to join.
  final String roomId;

  /// This client's peer id.
  final String peerId;

  /// The relay WebSocket URL (e.g. `wss://relay.example/?room=<id>`).
  final String relayUrl;

  /// The subtree that can access the room.
  final Widget child;

  /// The nearest [RoomController] above [context].
  static RoomController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<_RoomfulScope>();
    assert(scope != null, 'RoomfulProvider.of() requires a RoomfulProvider ancestor.');
    return scope!.controller;
  }

  @override
  State<RoomfulProvider> createState() => _RoomfulProviderState();
}

class _RoomfulProviderState extends State<RoomfulProvider> {
  late final RoomController _controller;

  @override
  void initState() {
    super.initState();
    _controller = RoomController(
      RoomfulClient(
        roomId: widget.roomId,
        peerId: widget.peerId,
        transport: WebSocketRelayTransport(widget.relayUrl),
      ),
    );
    unawaited(_controller.connect());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _RoomfulScope(controller: _controller, child: widget.child);
}

class _RoomfulScope extends InheritedNotifier<RoomController> {
  const _RoomfulScope({required RoomController controller, required super.child})
      : super(notifier: controller);

  RoomController get controller => notifier!;
}
