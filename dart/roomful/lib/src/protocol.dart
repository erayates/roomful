import 'dart:convert';

/// The Roomful wire protocol (RFC-0001): capabilities, session negotiation, the versioned
/// transport envelope, and the JSON codec. Mirrors `@roomful/core`'s `peer-message.ts` so
/// both SDKs share one contract, proven by the `protocol-fixtures/` vectors.

const List<String> _knownCodecs = <String>['json', 'msgpack'];

int _millisSinceEpoch() => DateTime.now().millisecondsSinceEpoch;

/// Protocol capabilities a peer advertises in its `hello` / `welcome` message.
class ProtocolCapabilities {
  const ProtocolCapabilities({
    required this.minVersion,
    required this.maxVersion,
    required this.codecs,
    required this.preferredCodec,
  });

  /// Builds capabilities with the fixed v1..v2 range, de-duplicating codecs and falling
  /// back to `json` when [preferredCodec] is not offered.
  factory ProtocolCapabilities.create(
    List<String> codecs,
    String preferredCodec,
  ) {
    final unique = <String>[];
    for (final codec in codecs) {
      if (_knownCodecs.contains(codec) && !unique.contains(codec)) {
        unique.add(codec);
      }
    }
    final resolved = unique.isEmpty ? <String>['json'] : unique;
    final preferred =
        resolved.contains(preferredCodec) ? preferredCodec : resolved.first;
    return ProtocolCapabilities(
      minVersion: 1,
      maxVersion: 2,
      codecs: resolved,
      preferredCodec: preferred,
    );
  }

  /// Parses capabilities from a decoded JSON map.
  factory ProtocolCapabilities.fromJson(Map<String, dynamic> json) {
    return ProtocolCapabilities(
      minVersion: json['minVersion'] as int,
      maxVersion: json['maxVersion'] as int,
      codecs: (json['codecs'] as List<dynamic>).cast<String>(),
      preferredCodec: json['preferredCodec'] as String,
    );
  }

  final int minVersion;
  final int maxVersion;
  final List<String> codecs;
  final String preferredCodec;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'minVersion': minVersion,
        'maxVersion': maxVersion,
        'codecs': codecs,
        'preferredCodec': preferredCodec,
      };
}

/// A negotiated session for a peer: the agreed protocol [version] and [codec].
class ProtocolSession {
  const ProtocolSession({
    required this.version,
    required this.codec,
    required this.legacy,
  });

  /// The v1 / json compatibility session used before or without negotiation.
  static const ProtocolSession legacyV1 = ProtocolSession(
    version: 1,
    codec: 'json',
    legacy: true,
  );

  final int version;
  final String codec;
  final bool legacy;

  @override
  bool operator ==(Object other) =>
      other is ProtocolSession &&
      other.version == version &&
      other.codec == codec &&
      other.legacy == legacy;

  @override
  int get hashCode => Object.hash(version, codec, legacy);

  Map<String, dynamic> toJson() => <String, dynamic>{
        'version': version,
        'codec': codec,
        'legacy': legacy,
      };
}

/// The outcome of negotiating a session against a remote peer's capabilities.
class NegotiationResult {
  const NegotiationResult({
    required this.compatible,
    required this.reason,
    this.session,
  });

  final bool compatible;
  final String reason;
  final ProtocolSession? session;
}

/// Negotiates a session, mirroring `negotiatePeerProtocolSession` in `@roomful/core`.
///
/// [supportsBinary] reflects whether the transport can carry binary frames (only then can
/// a v2 session use the `msgpack` codec).
NegotiationResult negotiateSession(
  ProtocolCapabilities local,
  ProtocolCapabilities? remote, {
  required bool supportsBinary,
}) {
  if (remote == null) {
    return const NegotiationResult(
      compatible: true,
      session: ProtocolSession.legacyV1,
      reason:
          'Remote peer did not advertise protocol capabilities; using legacy v1/json.',
    );
  }

  final sharedMin =
      local.minVersion > remote.minVersion ? local.minVersion : remote.minVersion;
  final sharedMax =
      local.maxVersion < remote.maxVersion ? local.maxVersion : remote.maxVersion;
  if (sharedMin > sharedMax) {
    return NegotiationResult(
      compatible: false,
      reason: 'No compatible protocol version. '
          'local=${local.minVersion}-${local.maxVersion} '
          'remote=${remote.minVersion}-${remote.maxVersion}.',
    );
  }

  final version = sharedMax == 1 ? 1 : 2;
  final useMessagePack = version >= 2 &&
      supportsBinary &&
      local.codecs.contains('msgpack') &&
      remote.codecs.contains('msgpack');

  return NegotiationResult(
    compatible: true,
    session: ProtocolSession(
      version: version,
      codec: useMessagePack ? 'msgpack' : 'json',
      legacy: false,
    ),
    reason: useMessagePack
        ? 'Negotiated v2/msgpack.'
        : version == 2
            ? 'Negotiated v2/json fallback.'
            : 'Negotiated v1/json compatibility session.',
  );
}

/// A protocol message, independent of the envelope framing that carries it. [payload] is
/// the decoded JSON payload for the message [type].
class WireMessage {
  const WireMessage({
    required this.type,
    required this.roomId,
    required this.fromPeerId,
    required this.timestamp,
    required this.payload,
    this.toPeerId,
  });

  final String type;
  final String roomId;
  final String fromPeerId;
  final String? toPeerId;
  final int timestamp;
  final Object? payload;
}

Object? _toLegacyPayload(String type, Object? payload) {
  if (type == 'event') {
    return <String, dynamic>{'event': payload};
  }
  return payload;
}

Object? _fromLegacyPayload(String type, Object? payload) {
  if (type == 'event') {
    return payload is Map<String, dynamic> ? payload['event'] : null;
  }
  return payload ?? <String, dynamic>{};
}

/// Encodes [message] into the RFC-0001 JSON transport envelope for [session] (the legacy
/// v1 envelope for a legacy/v1 session, otherwise the modern v2 envelope). MessagePack
/// encoding arrives in a later milestone.
String encodeJsonEnvelope(WireMessage message, ProtocolSession session) {
  if (session.legacy || session.version == 1) {
    return jsonEncode(<String, dynamic>{
      'source': 'roomful',
      'version': 1,
      'signal': <String, dynamic>{
        'type': message.type,
        'roomId': message.roomId,
        'fromPeerId': message.fromPeerId,
        if (message.toPeerId != null) 'toPeerId': message.toPeerId,
        'payload': _toLegacyPayload(message.type, message.payload),
      },
    });
  }

  return jsonEncode(<String, dynamic>{
    'source': 'roomful',
    'protocolVersion': 2,
    'codec': 'json',
    'roomId': message.roomId,
    'fromPeerId': message.fromPeerId,
    if (message.toPeerId != null) 'toPeerId': message.toPeerId,
    'timestamp': message.timestamp,
    'type': message.type,
    'payload': message.payload,
  });
}

/// Decodes a JSON transport envelope (v1 or v2) into a [WireMessage]. The v1 envelope has
/// no `timestamp`, so [now] (defaulting to the wall clock) fills it.
WireMessage decodeJsonEnvelope(String wire, {int Function()? now}) {
  final decoded = jsonDecode(wire);
  if (decoded is! Map<String, dynamic> || decoded['source'] != 'roomful') {
    throw const FormatException('Not a Roomful transport envelope.');
  }

  if (decoded['version'] == 1) {
    final signal = decoded['signal'] as Map<String, dynamic>;
    final type = signal['type'] as String;
    return WireMessage(
      type: type,
      roomId: signal['roomId'] as String,
      fromPeerId: signal['fromPeerId'] as String,
      toPeerId: signal['toPeerId'] as String?,
      timestamp: (now ?? _millisSinceEpoch)(),
      payload: _fromLegacyPayload(type, signal['payload']),
    );
  }

  if (decoded['protocolVersion'] == 2) {
    return WireMessage(
      type: decoded['type'] as String,
      roomId: decoded['roomId'] as String,
      fromPeerId: decoded['fromPeerId'] as String,
      toPeerId: decoded['toPeerId'] as String?,
      timestamp: decoded['timestamp'] as int,
      payload: decoded['payload'],
    );
  }

  throw const FormatException('Unrecognized Roomful envelope version.');
}
