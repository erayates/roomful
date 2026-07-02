import 'package:flutter/widgets.dart';

import 'color_util.dart';
import 'room_controller.dart';
import 'roomful_provider.dart';

/// A horizontal, overlapping stack of avatar chips — one per peer with presence in the room.
///
/// Reads presence from the nearest [RoomfulProvider] (or an explicit [controller]) and rebuilds
/// whenever presence changes. Each peer's `name` / `color` (override with [nameKey] / [colorKey])
/// drive the initials and background; peers with no colour fall back to one derived from their id.
///
/// Depends only on `package:flutter/widgets.dart`, so it drops into Material or Cupertino apps
/// alike. It needs a [Directionality] ancestor (any `MaterialApp` / `CupertinoApp` provides one).
class PresenceAvatars extends StatelessWidget {
  const PresenceAvatars({
    super.key,
    this.controller,
    this.includeSelf = true,
    this.size = 32,
    this.overlap = 10,
    this.max = 5,
    this.nameKey = 'name',
    this.colorKey = 'color',
  });

  /// The room controller to read presence from. Defaults to [RoomfulProvider.of].
  final RoomController? controller;

  /// Whether to include the local peer's own presence.
  final bool includeSelf;

  /// Diameter of each avatar, in logical pixels.
  final double size;

  /// How many pixels each avatar overlaps the previous one.
  final double overlap;

  /// The most avatars to show before collapsing the rest into a `+N` chip.
  final int max;

  /// The presence field holding a peer's display name.
  final String nameKey;

  /// The presence field holding a peer's colour (a `#rgb` or `#rrggbb` string).
  final String colorKey;

  @override
  Widget build(BuildContext context) {
    final room = controller ?? RoomfulProvider.of(context);
    return ListenableBuilder(
      listenable: room,
      builder: (context, _) => _build(room),
    );
  }

  Widget _build(RoomController room) {
    final peers = _peers(room);
    if (peers.isEmpty) {
      return const SizedBox.shrink();
    }

    final shown = peers.length > max ? peers.sublist(0, max) : peers;
    final overflow = peers.length - shown.length;
    final step = size - overlap;

    final children = <Widget>[
      for (var i = 0; i < shown.length; i++)
        Positioned(
          left: i * step,
          child: _Avatar(
            initials: _initials(shown[i]),
            color: _color(shown[i]),
            size: size,
          ),
        ),
      if (overflow > 0)
        Positioned(
          left: shown.length * step,
          child: _Avatar(
            initials: '+$overflow',
            color: const Color(0xFF3A4A45),
            size: size,
          ),
        ),
    ];

    final count = shown.length + (overflow > 0 ? 1 : 0);
    return SizedBox(
      height: size,
      width: size + (count - 1) * step,
      child: Stack(children: children),
    );
  }

  List<_PeerPresence> _peers(RoomController room) {
    return <_PeerPresence>[
      if (includeSelf) _PeerPresence(room.client.peerId, room.presence.local),
      for (final entry in room.presence.remote.entries)
        _PeerPresence(entry.key, entry.value),
    ];
  }

  String _initials(_PeerPresence peer) {
    final name = peer.data[nameKey];
    if (name is String && name.trim().isNotEmpty) {
      final parts = name.trim().split(RegExp(r'\s+'));
      final String letters;
      if (parts.length >= 2) {
        letters = '${parts[0][0]}${parts[1][0]}';
      } else {
        final word = parts[0];
        letters = word.length >= 2 ? word.substring(0, 2) : word;
      }
      return letters.toUpperCase();
    }
    final id = peer.id;
    return (id.length >= 2 ? id.substring(0, 2) : id).toUpperCase();
  }

  Color _color(_PeerPresence peer) {
    final raw = peer.data[colorKey];
    if (raw is String) {
      final parsed = parseHexColor(raw);
      if (parsed != null) {
        return parsed;
      }
    }
    return colorFromId(peer.id);
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.initials,
    required this.color,
    required this.size,
  });

  final String initials;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: const Color(0xFF0A0F0E), width: 2),
      ),
      child: Text(
        initials,
        style: TextStyle(
          color: const Color(0xFFFFFFFF),
          fontSize: size * 0.36,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _PeerPresence {
  const _PeerPresence(this.id, this.data);

  final String id;
  final Map<String, dynamic> data;
}
