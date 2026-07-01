import { env } from '../internal/env';
import { createRoomfulError } from '../roomful-error';
import type { PresenceData, RoomOptions, Unsubscribe } from '../types';
import type { TransportAdapter, TransportSignal } from './transport';
import {
  createWebSocketTransportAdapter,
  type WebSocketFactory,
  type WebSocketLike,
} from './websocket';

// WebTransport carries the exact same relay wire protocol as the WebSocket transport
// (join / joined / transport / peer-joined / peer-left / error). The only difference is
// the byte pipe: a WebTransport bidirectional stream is a raw byte stream with no message
// boundaries, whereas WebSocket delivers discrete frames. So this module is a thin
// WebTransport -> WebSocketLike shim (adding length-prefix framing) plus a delegating
// adapter that reports `kind: 'webtransport'`. All relay handshake / protocol-negotiation
// logic is reused unchanged from `./websocket`.

const READY_STATE_CONNECTING = 0;
const READY_STATE_OPEN = 1;
const READY_STATE_CLOSED = 3;

const FRAME_KIND_TEXT = 0;
const FRAME_KIND_BINARY = 1;
// [1 byte frame kind][4 byte big-endian payload length][payload]
const FRAME_HEADER_BYTES = 5;

export interface WebTransportReaderLike {
  read(): Promise<{ value?: Uint8Array | undefined; done: boolean }>;
  cancel?(reason?: unknown): Promise<void>;
}

export interface WebTransportWriterLike {
  write(chunk: Uint8Array): Promise<void>;
  close?(): Promise<void>;
}

export interface WebTransportBidirectionalStreamLike {
  readable: { getReader(): WebTransportReaderLike };
  writable: { getWriter(): WebTransportWriterLike };
}

export interface WebTransportLike {
  readonly ready: Promise<void>;
  readonly closed: Promise<unknown>;
  createBidirectionalStream(): Promise<WebTransportBidirectionalStreamLike>;
  close(info?: { closeCode?: number; reason?: string }): void;
}

export type WebTransportFactory = (url: string) => WebTransportLike;

interface ShimEvent {
  data: unknown;
  reason?: string;
}

type ShimEventType = 'open' | 'message' | 'error' | 'close';

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) {
    return b;
  }
  if (b.length === 0) {
    return a;
  }
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Presents a WebTransport bidirectional stream through the event-based `WebSocketLike`
 * surface the relay transport adapter consumes, framing each relay message with a
 * 5-byte header so message boundaries survive the raw byte stream.
 */
export class WebTransportSocket implements WebSocketLike {
  private readonly encoder = new TextEncoder();

  private readonly decoder = new TextDecoder();

  private readonly listeners: Record<ShimEventType, Set<(event: ShimEvent) => void>> = {
    open: new Set(),
    message: new Set(),
    error: new Set(),
    close: new Set(),
  };

  private currentReadyState: number = READY_STATE_CONNECTING;

  private writer: WebTransportWriterLike | null = null;

  private inbound: Uint8Array = new Uint8Array(0);

  public constructor(private readonly transport: WebTransportLike) {
    void this.init();
  }

  public get readyState(): number {
    return this.currentReadyState;
  }

  public addEventListener(type: ShimEventType, listener: (event: ShimEvent) => void): void {
    this.listeners[type].add(listener);
  }

  public removeEventListener(type: ShimEventType, listener: (event: ShimEvent) => void): void {
    this.listeners[type].delete(listener);
  }

  public send(payload: string | Uint8Array): void {
    const writer = this.writer;
    if (!writer || this.currentReadyState !== READY_STATE_OPEN) {
      return;
    }

    void writer.write(this.frame(payload)).catch(() => {
      this.handleClosed('WebTransport write failed.');
    });
  }

  public close(_code?: number, reason?: string): void {
    const alreadyClosed = this.currentReadyState === READY_STATE_CLOSED;
    this.currentReadyState = READY_STATE_CLOSED;

    try {
      this.transport.close(reason !== undefined ? { reason } : undefined);
    } catch {
      // Closing an already-failed WebTransport can throw; the pipe is gone either way.
    }

    if (!alreadyClosed) {
      this.emit('close', reason !== undefined ? { data: undefined, reason } : { data: undefined });
    }
  }

  private async init(): Promise<void> {
    try {
      await this.transport.ready;
      const stream = await this.transport.createBidirectionalStream();
      this.writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      this.currentReadyState = READY_STATE_OPEN;
      void this.pump(reader);
      this.emit('open', { data: undefined });
      void this.transport.closed.then(
        () => {
          this.handleClosed('WebTransport closed.');
        },
        () => {
          this.handleClosed('WebTransport closed.');
        },
      );
    } catch {
      this.currentReadyState = READY_STATE_CLOSED;
      this.emit('error', { data: undefined });
      this.emit('close', { data: undefined, reason: 'WebTransport connection failed.' });
    }
  }

  private async pump(reader: WebTransportReaderLike): Promise<void> {
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        if (result.value) {
          this.handleChunk(result.value);
        }
      }
    } catch {
      // A read error means the stream is gone; fall through to the close notification.
    }

    this.handleClosed('WebTransport stream closed.');
  }

  private handleChunk(chunk: Uint8Array): void {
    this.inbound = concatBytes(this.inbound, chunk);

    for (;;) {
      if (this.inbound.length < FRAME_HEADER_BYTES) {
        return;
      }

      const view = new DataView(
        this.inbound.buffer,
        this.inbound.byteOffset,
        this.inbound.byteLength,
      );
      const kind = view.getUint8(0);
      const length = view.getUint32(1, false);
      if (this.inbound.length < FRAME_HEADER_BYTES + length) {
        return;
      }

      const body = this.inbound.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + length);
      if (kind === FRAME_KIND_TEXT) {
        this.emit('message', { data: this.decoder.decode(body) });
      } else {
        this.emit('message', { data: body.slice() });
      }

      this.inbound = this.inbound.subarray(FRAME_HEADER_BYTES + length);
    }
  }

  private frame(payload: string | Uint8Array): Uint8Array {
    let body: Uint8Array;
    let kind: number;
    if (typeof payload === 'string') {
      body = this.encoder.encode(payload);
      kind = FRAME_KIND_TEXT;
    } else {
      body = payload;
      kind = FRAME_KIND_BINARY;
    }

    const out = new Uint8Array(FRAME_HEADER_BYTES + body.length);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setUint8(0, kind);
    view.setUint32(1, body.length, false);
    out.set(body, FRAME_HEADER_BYTES);
    return out;
  }

  private handleClosed(reason: string): void {
    if (this.currentReadyState === READY_STATE_CLOSED) {
      return;
    }

    this.currentReadyState = READY_STATE_CLOSED;
    this.emit('close', { data: undefined, reason });
  }

  private emit(type: ShimEventType, event: ShimEvent): void {
    for (const listener of this.listeners[type]) {
      listener(event);
    }
  }
}

class WebTransportTransportAdapter implements TransportAdapter {
  public readonly kind = 'webtransport' as const;

  public constructor(private readonly inner: TransportAdapter) {}

  public connect(): Promise<void> {
    return this.inner.connect();
  }

  public disconnect(): Promise<void> {
    return this.inner.disconnect();
  }

  public send(signal: TransportSignal): void {
    this.inner.send(signal);
  }

  public broadcast(signal: TransportSignal): void {
    this.inner.broadcast(signal);
  }

  public onMessage(handler: (signal: TransportSignal) => void): Unsubscribe {
    return this.inner.onMessage(handler);
  }
}

function resolveWebTransportFactory(factory?: WebTransportFactory): WebTransportFactory {
  if (factory) {
    return factory;
  }

  if (!env.hasWebTransport) {
    throw createRoomfulError(
      'NETWORK_ERROR',
      'WebTransport transport is not available in this runtime.',
      false,
      {
        source: 'webtransport',
        kind: 'runtime-unavailable',
      },
    );
  }

  return (url: string) => new WebTransport(url);
}

export function createWebTransportTransportAdapter<TPresence extends PresenceData = PresenceData>(
  roomId: string,
  peerId: string,
  options: RoomOptions<TPresence>,
  factory?: WebTransportFactory,
): TransportAdapter {
  const createWebTransport = resolveWebTransportFactory(factory);
  const socketFactory: WebSocketFactory = (url) => new WebTransportSocket(createWebTransport(url));
  return new WebTransportTransportAdapter(
    createWebSocketTransportAdapter(roomId, peerId, options, socketFactory),
  );
}
