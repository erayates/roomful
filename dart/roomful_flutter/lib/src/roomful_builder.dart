import 'package:flutter/widgets.dart';

import 'room_controller.dart';
import 'roomful_provider.dart';

/// Rebuilds [builder] whenever the room changes (presence, cursors, peers), reading the
/// [RoomController] from the nearest [RoomfulProvider]. Because it depends on the provider's
/// notifier, it rebuilds automatically on every room update.
class RoomfulBuilder extends StatelessWidget {
  const RoomfulBuilder({required this.builder, super.key});

  /// Builds the subtree from the current [RoomController].
  final Widget Function(BuildContext context, RoomController room) builder;

  @override
  Widget build(BuildContext context) => builder(context, RoomfulProvider.of(context));
}
