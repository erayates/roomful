import { describe, expect, it } from 'vitest';

import { env } from '../internal/env';
import { parseWebSocketRelayClientMessage } from './websocket.protocol';
import type {
  WebTransportBidirectionalStreamLike,
  WebTransportLike,
  WebTransportReaderLike,
  WebTransportWriterLike,
} from './webtransport';
import { createWebTransportTransportAdapter, WebTransportSocket } from './webtransport';

const FRAME_HEADER_BYTES = 5;
const FRAME_KIND_TEXT = 0;
const FRAME_KIND_BINARY = 1;

function frame(kind: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(FRAME_HEADER_BYTES + body.length);
  const view = new DataView(out.buffer);
  view.setUint8(0, kind);
  view.setUint32(1, body.length, false);
  out.set(body, FRAME_HEADER_BYTES);
  return out;
}

function frameText(text: string): Uint8Array {
  return frame(FRAME_KIND_TEXT, new TextEncoder().encode(text));
}

function unframe(bytes: Uint8Array): { kind: number; body: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(1, false);
  return {
    kind: view.getUint8(0),
    body: bytes.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + length),
  };
}

class MockBidiStream implements WebTransportBidirectionalStreamLike {
  public readonly written: Uint8Array[] = [];

  public onWrite: ((chunk: Uint8Array) => void) | null = null;

  private readQueue: Uint8Array[] = [];

  private pending: ((result: { value?: Uint8Array; done: boolean }) => void) | null = null;

  private done = false;

  public readable: { getReader(): WebTransportReaderLike } = {
    getReader: (): WebTransportReaderLike => ({
      read: () =>
        new Promise((resolve) => {
          const next = this.readQueue.shift();
          if (next) {
            resolve({ value: next, done: false });
            return;
          }
          if (this.done) {
            resolve({ value: undefined, done: true });
            return;
          }
          this.pending = resolve;
        }),
      cancel: async () => {
        this.done = true;
      },
    }),
  };

  public writable: { getWriter(): WebTransportWriterLike } = {
    getWriter: (): WebTransportWriterLike => ({
      write: async (chunk: Uint8Array) => {
        this.written.push(chunk);
        this.onWrite?.(chunk);
      },
      close: async () => undefined,
    }),
  };

  public push(chunk: Uint8Array): void {
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({ value: chunk, done: false });
      return;
    }
    this.readQueue.push(chunk);
  }

  public finish(): void {
    this.done = true;
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({ value: undefined, done: true });
    }
  }
}

class MockWebTransport implements WebTransportLike {
  public readonly ready = Promise.resolve();

  public readonly stream = new MockBidiStream();

  public readonly closeCalls: Array<{ closeCode?: number; reason?: string } | undefined> = [];

  public closed: Promise<unknown>;

  private resolveClosed: () => void = () => undefined;

  public constructor() {
    this.closed = new Promise((resolve) => {
      this.resolveClosed = () => resolve(undefined);
    });
  }

  public async createBidirectionalStream(): Promise<WebTransportBidirectionalStreamLike> {
    return this.stream;
  }

  public close(info?: { closeCode?: number; reason?: string }): void {
    this.closeCalls.push(info);
    this.resolveClosed();
  }

  public triggerClosed(): void {
    this.resolveClosed();
  }
}

// Lets the shim's async init (`await ready` -> createBidirectionalStream) settle.
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('WebTransportSocket', () => {
  it('opens after the stream is established', async () => {
    const transport = new MockWebTransport();
    const socket = new WebTransportSocket(transport);
    let opened = false;
    socket.addEventListener('open', () => {
      opened = true;
    });

    await flush();

    expect(opened).toBe(true);
    expect(socket.readyState).toBe(1);
  });

  it('length-prefix frames outbound text and binary payloads', async () => {
    const transport = new MockWebTransport();
    const socket = new WebTransportSocket(transport);
    await flush();

    socket.send('{"type":"join"}');
    socket.send(new Uint8Array([9, 8, 7]));

    const textFrame = unframe(transport.stream.written[0]);
    expect(textFrame.kind).toBe(FRAME_KIND_TEXT);
    expect(new TextDecoder().decode(textFrame.body)).toBe('{"type":"join"}');

    const binaryFrame = unframe(transport.stream.written[1]);
    expect(binaryFrame.kind).toBe(FRAME_KIND_BINARY);
    expect(Array.from(binaryFrame.body)).toEqual([9, 8, 7]);
  });

  it('deframes inbound text into string message events', async () => {
    const transport = new MockWebTransport();
    const socket = new WebTransportSocket(transport);
    const received: unknown[] = [];
    socket.addEventListener('message', (event) => {
      received.push(event.data);
    });
    await flush();

    transport.stream.push(frameText('{"type":"joined"}'));
    await flush();

    expect(received).toEqual(['{"type":"joined"}']);
  });

  it('deframes inbound binary into Uint8Array message events', async () => {
    const transport = new MockWebTransport();
    const socket = new WebTransportSocket(transport);
    const received: unknown[] = [];
    socket.addEventListener('message', (event) => {
      received.push(event.data);
    });
    await flush();

    transport.stream.push(frame(FRAME_KIND_BINARY, new Uint8Array([1, 2, 3])));
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(Uint8Array);
    expect(Array.from(received[0] as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('reassembles a frame split across multiple reads', async () => {
    const transport = new MockWebTransport();
    const socket = new WebTransportSocket(transport);
    const received: unknown[] = [];
    socket.addEventListener('message', (event) => {
      received.push(event.data);
    });
    await flush();

    const full = frameText('split-payload');
    transport.stream.push(full.subarray(0, 3));
    await flush();
    expect(received).toHaveLength(0);

    transport.stream.push(full.subarray(3));
    await flush();
    expect(received).toEqual(['split-payload']);
  });

  it('splits two frames coalesced into one chunk', async () => {
    const transport = new MockWebTransport();
    const socket = new WebTransportSocket(transport);
    const received: unknown[] = [];
    socket.addEventListener('message', (event) => {
      received.push(event.data);
    });
    await flush();

    const a = frameText('a');
    const b = frameText('bb');
    const combined = new Uint8Array(a.length + b.length);
    combined.set(a, 0);
    combined.set(b, a.length);
    transport.stream.push(combined);
    await flush();

    expect(received).toEqual(['a', 'bb']);
  });

  it('emits close when the WebTransport session closes', async () => {
    const transport = new MockWebTransport();
    const socket = new WebTransportSocket(transport);
    let closedReason: string | undefined = 'unset';
    socket.addEventListener('close', (event) => {
      closedReason = event.reason;
    });
    await flush();

    transport.triggerClosed();
    await flush();

    expect(socket.readyState).toBe(3);
    expect(typeof closedReason).toBe('string');
  });

  it('closes the underlying transport on close()', async () => {
    const transport = new MockWebTransport();
    const socket = new WebTransportSocket(transport);
    await flush();

    socket.close(1000, 'bye');

    expect(transport.closeCalls).toEqual([{ reason: 'bye' }]);
    expect(socket.readyState).toBe(3);
  });
});

describe('createWebTransportTransportAdapter', () => {
  it('reports kind "webtransport"', () => {
    const adapter = createWebTransportTransportAdapter(
      'room',
      'peer',
      { relayUrl: 'https://relay.example' },
      () => new MockWebTransport(),
    );

    expect(adapter.kind).toBe('webtransport');
  });

  it('completes a relay join handshake through the shim', async () => {
    const transport = new MockWebTransport();
    transport.stream.onWrite = (chunk) => {
      const { body } = unframe(chunk);
      const message = parseWebSocketRelayClientMessage(new TextDecoder().decode(body));
      if (message?.type === 'join') {
        transport.stream.push(
          frameText(
            JSON.stringify({
              type: 'joined',
              roomId: message.roomId,
              peerId: message.peerId,
              peers: [],
            }),
          ),
        );
      }
    };

    const adapter = createWebTransportTransportAdapter(
      'room',
      'peer',
      { relayUrl: 'https://relay.example' },
      () => transport,
    );

    await adapter.connect();

    expect(adapter.kind).toBe('webtransport');
    await adapter.disconnect();
  });

  it('throws a runtime-unavailable error when WebTransport is missing and no factory is given', () => {
    if (env.hasWebTransport) {
      return;
    }

    expect(() =>
      createWebTransportTransportAdapter('room', 'peer', { relayUrl: 'https://relay.example' }),
    ).toThrowError(/not available/i);
  });
});
