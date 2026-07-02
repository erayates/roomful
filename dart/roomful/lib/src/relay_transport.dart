import 'dart:async';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'transport.dart';

/// A [RoomfulTransport] over a WebSocket relay (`@roomful/relay`, or the Cloudflare edge
/// relay). It carries JSON relay frames; [RoomfulClient] wraps peer envelopes in them.
///
/// The end-to-end network behaviour needs a running relay to exercise; the protocol and
/// client logic are covered by unit tests against a fake transport.
class WebSocketRelayTransport implements RoomfulTransport {
  WebSocketRelayTransport(this.url);

  /// The relay WebSocket URL — e.g. `wss://relay.example` or a Cloudflare edge
  /// `wss://<worker-host>/?room=<roomId>` endpoint.
  final String url;

  WebSocketChannel? _channel;
  final StreamController<Object> _inbound = StreamController<Object>.broadcast();

  @override
  Stream<Object> get inbound => _inbound.stream;

  @override
  Future<void> connect() async {
    final channel = WebSocketChannel.connect(Uri.parse(url));
    await channel.ready;
    _channel = channel;
    channel.stream.listen(
      (Object? data) {
        if (data != null && !_inbound.isClosed) {
          _inbound.add(data);
        }
      },
      onError: (Object error) {
        if (!_inbound.isClosed) {
          _inbound.addError(error);
        }
      },
      onDone: _closeInbound,
      cancelOnError: false,
    );
  }

  @override
  void send(Object frame) => _channel?.sink.add(frame);

  @override
  Future<void> close() async {
    await _channel?.sink.close();
    _channel = null;
    _closeInbound();
  }

  void _closeInbound() {
    if (!_inbound.isClosed) {
      unawaited(_inbound.close());
    }
  }
}
