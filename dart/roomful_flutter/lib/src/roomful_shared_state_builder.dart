import 'package:flutter/widgets.dart';

import 'room_controller.dart';
import 'roomful_provider.dart';

/// A typed, reactive view of the room's shared (last-write-wins) value.
///
/// Reads the shared value from the nearest [RoomfulProvider] (or an explicit [controller]) and
/// rebuilds whenever it changes. The [builder] receives the current value as a `T?` (null before
/// anything is set, or when the value isn't a `T`) and a setter to publish a new one.
///
/// The `roomful` core keeps a single shared value per room, so one of these per room reflects that
/// value; use distinct keys inside a `Map` value if you need several logical fields.
class RoomfulSharedStateBuilder<T extends Object> extends StatelessWidget {
  const RoomfulSharedStateBuilder({
    super.key,
    required this.builder,
    this.controller,
  });

  /// The room controller to read shared state from. Defaults to [RoomfulProvider.of].
  final RoomController? controller;

  /// Builds the subtree from the current shared value and a setter to publish a new one.
  final Widget Function(BuildContext context, T? value, ValueChanged<T> set)
      builder;

  @override
  Widget build(BuildContext context) {
    final room = controller ?? RoomfulProvider.of(context);
    return ListenableBuilder(
      listenable: room,
      builder: (context, _) {
        final raw = room.sharedValue;
        return builder(context, raw is T ? raw : null, room.setSharedState);
      },
    );
  }
}
