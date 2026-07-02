import 'dart:async';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'transport.dart';

/// A [RoomfulTransport] over a WebSocket relay (`@roomful/relay`, or the Cloudflare edge
/// relay). It carries JSON relay frames; [RoomfulClient] wraps peer envelopes in them.
///
/// It is reusable: a dropped socket closes the current [inbound] stream (signalling the drop), and
/// a later [connect] opens a fresh channel and inbound stream, so [RoomfulClient]'s auto-reconnect
/// can re-establish it.
///
/// The end-to-end network behaviour needs a running relay to exercise; the protocol and
/// client logic are covered by unit tests against a fake transport.
class WebSocketRelayTransport implements RoomfulTransport {
  WebSocketRelayTransport(this.url);

  /// The relay WebSocket URL — e.g. `wss://relay.example` or a Cloudflare edge
  /// `wss://<worker-host>/?room=<roomId>` endpoint.
  final String url;

  WebSocketChannel? _channel;
  StreamController<Object> _inbound = StreamController<Object>.broadcast();

  @override
  Stream<Object> get inbound => _inbound.stream;

  @override
  Future<void> connect() async {
    // A reconnect re-opens the transport after the previous inbound closed; give it a fresh one
    // so the client's re-subscription receives live frames.
    if (_inbound.isClosed) {
      _inbound = StreamController<Object>.broadcast();
    }
    final inbound = _inbound;
    final channel = WebSocketChannel.connect(Uri.parse(url));
    await channel.ready;
    _channel = channel;
    channel.stream.listen(
      (Object? data) {
        if (data != null && !inbound.isClosed) {
          inbound.add(data);
        }
      },
      onError: (Object error) {
        if (!inbound.isClosed) {
          inbound.addError(error);
        }
      },
      onDone: () {
        if (!inbound.isClosed) {
          unawaited(inbound.close());
        }
      },
      cancelOnError: false,
    );
  }

  @override
  void send(Object frame) => _channel?.sink.add(frame);

  @override
  Future<void> close() async {
    await _channel?.sink.close();
    _channel = null;
    if (!_inbound.isClosed) {
      await _inbound.close();
    }
  }
}
