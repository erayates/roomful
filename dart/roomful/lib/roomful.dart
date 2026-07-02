/// Roomful — open-source, self-hostable realtime collaboration for Dart and Flutter.
///
/// This is the `v2.1-alpha` scaffold (EP-11): a faithful Dart implementation of the
/// Roomful wire protocol from [RFC-0001] — capabilities, session negotiation, the
/// versioned transport envelope, and the JSON codec — plus the transport interface the
/// room client will drive. The room-client lifecycle (connect / presence / events /
/// shared state) lands in a later milestone.
///
/// Conformance is proven against the shared `protocol-fixtures/` vectors that the
/// TypeScript `@roomful/core` generates, so the two SDKs share one contract.
///
/// [RFC-0001]: https://github.com/erayates/roomful/blob/main/rfcs/0001-protocol-v2.md
library;

export 'src/protocol.dart';
export 'src/transport.dart';
