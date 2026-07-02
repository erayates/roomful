import 'package:flutter/widgets.dart';

import 'color_util.dart';
import 'room_controller.dart';
import 'roomful_provider.dart';

/// Paints remote peers' live cursors on top of a [child] surface.
///
/// Reads cursors from the nearest [RoomfulProvider] (or an explicit [controller]) and rebuilds as
/// they move. Each cursor's position comes from the `x` / `y` fields of the peer's cursor payload
/// (override with [xKey] / [yKey]); set [normalized] when those are `0..1` fractions of the surface
/// (the portable choice across differently-sized viewports) rather than logical pixels. A peer's
/// `name` / `color` presence (override with [nameKey] / [colorKey]) label and colour the pointer.
///
/// Depends only on `package:flutter/widgets.dart`. Give it a bounded [child] so the overlay has a
/// size to position within.
class LiveCursorsOverlay extends StatelessWidget {
  const LiveCursorsOverlay({
    super.key,
    required this.child,
    this.controller,
    this.xKey = 'x',
    this.yKey = 'y',
    this.normalized = false,
    this.nameKey = 'name',
    this.colorKey = 'color',
    this.showLabels = true,
  });

  /// The surface the cursors are drawn over.
  final Widget child;

  /// The room controller to read cursors from. Defaults to [RoomfulProvider.of].
  final RoomController? controller;

  /// The cursor-payload field holding the horizontal position.
  final String xKey;

  /// The cursor-payload field holding the vertical position.
  final String yKey;

  /// Whether `x` / `y` are `0..1` fractions of the surface rather than logical pixels.
  final bool normalized;

  /// The presence field holding a peer's display name.
  final String nameKey;

  /// The presence field holding a peer's colour (a `#rgb` or `#rrggbb` string).
  final String colorKey;

  /// Whether to draw a name label beside each pointer.
  final bool showLabels;

  @override
  Widget build(BuildContext context) {
    final room = controller ?? RoomfulProvider.of(context);
    return ListenableBuilder(
      listenable: room,
      builder: (context, _) => LayoutBuilder(
        builder: (context, constraints) => Stack(
          children: <Widget>[
            child,
            ..._cursors(room, constraints),
          ],
        ),
      ),
    );
  }

  List<Widget> _cursors(RoomController room, BoxConstraints constraints) {
    final widgets = <Widget>[];
    for (final entry in room.cursors.remote.entries) {
      final x = _coord(entry.value[xKey]);
      final y = _coord(entry.value[yKey]);
      if (x == null || y == null) {
        continue;
      }
      final presence =
          room.presence.remote[entry.key] ?? const <String, dynamic>{};
      widgets.add(
        Positioned(
          left: normalized ? x * constraints.maxWidth : x,
          top: normalized ? y * constraints.maxHeight : y,
          child: _Cursor(
            color: _resolveColor(presence, entry.key),
            label: showLabels ? _resolveName(presence, entry.key) : null,
          ),
        ),
      );
    }
    return widgets;
  }

  double? _coord(Object? value) => value is num ? value.toDouble() : null;

  Color _resolveColor(Map<String, dynamic> presence, String peerId) {
    final raw = presence[colorKey];
    if (raw is String) {
      final parsed = parseHexColor(raw);
      if (parsed != null) {
        return parsed;
      }
    }
    return colorFromId(peerId);
  }

  String _resolveName(Map<String, dynamic> presence, String peerId) {
    final name = presence[nameKey];
    return name is String && name.trim().isNotEmpty ? name : peerId;
  }
}

class _Cursor extends StatelessWidget {
  const _Cursor({required this.color, this.label});

  final Color color;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final label = this.label;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        CustomPaint(size: const Size(16, 16), painter: _PointerPainter(color)),
        if (label != null)
          Container(
            margin: const EdgeInsets.only(top: 2, left: 6),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              label,
              style: const TextStyle(
                color: Color(0xFFFFFFFF),
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }
}

class _PointerPainter extends CustomPainter {
  const _PointerPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final fill = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(0, size.height)
      ..lineTo(size.width * 0.32, size.height * 0.7)
      ..lineTo(size.width * 0.72, size.height * 0.72)
      ..close();
    canvas.drawPath(path, fill);
  }

  @override
  bool shouldRepaint(_PointerPainter oldDelegate) => oldDelegate.color != color;
}
