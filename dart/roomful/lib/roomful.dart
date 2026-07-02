/// Roomful — open-source, self-hostable realtime collaboration for Dart and Flutter.
///
/// The `v2.1-alpha` Dart core (EP-11): a faithful implementation of the Roomful wire
/// protocol from [RFC-0001] — capabilities, session negotiation, the versioned transport
/// envelope, and the JSON codec — the relay control protocol, a [RoomfulClient] room
/// lifecycle (join, peer registry, message relay), and a WebSocket relay transport.
///
/// Conformance is proven against the shared `protocol-fixtures/` vectors that the
/// TypeScript `@roomful/core` generates, so the two SDKs share one contract.
///
/// The room-primitive APIs (presence, cursors, events, shared state) and the MessagePack
/// codec land in a following milestone.
///
/// [RFC-0001]: https://github.com/erayates/roomful/blob/main/rfcs/0001-protocol-v2.md
library;

export 'src/client.dart';
export 'src/cursors.dart';
export 'src/events.dart';
export 'src/locks.dart';
export 'src/presence.dart';
export 'src/protocol.dart';
export 'src/relay.dart';
export 'src/relay_transport.dart';
export 'src/shared_state.dart';
export 'src/transport.dart';
