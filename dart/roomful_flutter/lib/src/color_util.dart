import 'package:flutter/widgets.dart';

/// Parses `#rgb` / `#rrggbb` / `#aarrggbb` (with or without the leading `#`). Returns null on
/// anything it can't read, so callers can fall back.
Color? parseHexColor(String value) {
  var hex = value.trim();
  if (hex.startsWith('#')) {
    hex = hex.substring(1);
  }
  if (hex.length == 3) {
    hex = hex.split('').map((c) => '$c$c').join();
  }
  if (hex.length == 6) {
    hex = 'FF$hex';
  }
  if (hex.length != 8) {
    return null;
  }
  final argb = int.tryParse(hex, radix: 16);
  return argb == null ? null : Color(argb);
}

/// A stable, readable colour derived from an arbitrary id (fixed saturation / lightness so white
/// text stays legible on top).
Color colorFromId(String id) {
  var hash = 0;
  for (final unit in id.codeUnits) {
    hash = (hash * 31 + unit) & 0x7FFFFFFF;
  }
  return HSLColor.fromAHSL(1, (hash % 360).toDouble(), 0.55, 0.5).toColor();
}
