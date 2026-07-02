/// A transport carries codec-encoded Roomful protocol frames between a peer and the room
/// (directly or via a relay). Concrete implementations — a WebSocket relay client, and
/// later WebTransport — arrive in a following milestone; this interface fixes the shape
/// the room client depends on.
abstract interface class RoomfulTransport {
  /// Opens the transport and completes once it is ready to send and receive.
  Future<void> connect();

  /// Closes the transport and releases its resources.
  Future<void> close();

  /// Sends one already codec-encoded wire frame (a JSON [String] or binary bytes).
  void send(Object frame);

  /// Inbound wire frames, each a JSON [String] or binary bytes.
  Stream<Object> get inbound;
}
