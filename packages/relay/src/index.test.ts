import { createHmac } from 'node:crypto';

import { encode } from '@msgpack/msgpack';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { createRelayServer, type RelayServer } from './index.js';
import { registerRedisIntegrationTests } from './redis.integration.helper.js';

interface JsonMessage {
  type: string;
  [key: string]: unknown;
}

const SOCKET_CLOSE_TIMEOUT_MS = 1_000;
const MSGPACK_PROTOCOL = {
  minVersion: 1 as const,
  maxVersion: 2 as const,
  codecs: ['json', 'msgpack'] as const,
  preferredCodec: 'msgpack' as const,
};

function toUtf8(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  return Buffer.from(data as ArrayBuffer).toString('utf8');
}

function waitForOpen(socket: WebSocket, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    if (socket.readyState !== WebSocket.CONNECTING) {
      reject(new Error(`Socket is not connecting (readyState=${socket.readyState}).`));
      return;
    }

    const timer = setTimeout(() => {
      socket.off('open', onOpen);
      socket.off('error', onError);
      reject(new Error(`Timed out waiting for socket open after ${timeoutMs}ms.`));
    }, timeoutMs);

    const onOpen = (): void => {
      clearTimeout(timer);
      socket.off('error', onError);
      resolve();
    };

    const onError = (error: Error): void => {
      clearTimeout(timer);
      socket.off('open', onOpen);
      reject(error);
    };

    socket.once('open', onOpen);
    socket.once('error', onError);
  });
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: JsonMessage) => boolean,
  timeoutMs = 2_000,
): Promise<JsonMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for message after ${timeoutMs}ms.`));
    }, timeoutMs);

    const onMessage = (data: unknown): void => {
      const parsed = JSON.parse(toUtf8(data)) as JsonMessage;
      if (!predicate(parsed)) {
        return;
      }

      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(parsed);
    };

    socket.on('message', onMessage);
  });
}

function waitForRawMessage(
  socket: WebSocket,
  predicate: (data: unknown, isBinary: boolean) => boolean,
  timeoutMs = 2_000,
): Promise<{ data: unknown; isBinary: boolean }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for raw message after ${timeoutMs}ms.`));
    }, timeoutMs);

    const onMessage = (data: unknown, isBinary: boolean): void => {
      if (!predicate(data, isBinary)) {
        return;
      }

      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve({
        data,
        isBinary,
      });
    };

    socket.on('message', onMessage);
  });
}

function waitForClose(
  socket: WebSocket,
  timeoutMs = 2_000,
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('close', onClose);
      reject(new Error(`Timed out waiting for socket close after ${timeoutMs}ms.`));
    }, timeoutMs);

    const onClose = (code: number, reason: Buffer): void => {
      clearTimeout(timer);
      socket.off('close', onClose);
      resolve({
        code,
        reason: reason.toString('utf8'),
      });
    };

    socket.once('close', onClose);
  });
}

function waitForUpgradeRejection(socket: WebSocket, timeoutMs = 2_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for upgrade rejection after ${timeoutMs}ms.`));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off('open', onOpen);
      socket.off('error', onError);
      socket.off('unexpected-response', onUnexpectedResponse);
    };

    const onOpen = (): void => {
      cleanup();
      reject(new Error('Expected websocket upgrade rejection.'));
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const onUnexpectedResponse = (_request: unknown, response: { statusCode?: number }): void => {
      cleanup();
      resolve(response.statusCode ?? 0);
    };

    socket.once('open', onOpen);
    socket.once('error', onError);
    socket.once('unexpected-response', onUnexpectedResponse);
  });
}

function toHttpUrl(address: string, path: string): string {
  const url = new URL(address);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = path;
  url.search = '';
  return url.toString();
}

function withQueryTokens(address: string, ...tokens: string[]): string {
  const url = new URL(address);
  for (const token of tokens) {
    url.searchParams.append('token', token);
  }

  return url.toString();
}

async function createPollingSession(
  address: string,
  payload: Record<string, unknown>,
  token?: string,
): Promise<Response> {
  return fetch(toHttpUrl(address, '/poll/sessions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

async function waitForPollingEvent(
  address: string,
  sessionId: string,
  timeoutMs = 2_000,
): Promise<Response> {
  const url = new URL(toHttpUrl(address, `/poll/sessions/${encodeURIComponent(sessionId)}/events`));
  url.searchParams.set('timeoutMs', String(timeoutMs));
  return fetch(url.toString());
}

async function sendPollingTransport(
  address: string,
  sessionId: string,
  payload: JsonMessage,
): Promise<Response> {
  return fetch(toHttpUrl(address, `/poll/sessions/${encodeURIComponent(sessionId)}/messages`), {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
}

async function deletePollingSession(address: string, sessionId: string): Promise<Response> {
  return fetch(toHttpUrl(address, `/poll/sessions/${encodeURIComponent(sessionId)}`), {
    method: 'DELETE',
  });
}

function send(socket: WebSocket, payload: JsonMessage): void {
  socket.send(JSON.stringify(payload));
}

function createTransportFrame(message: {
  type: string;
  roomId: string;
  fromPeerId: string;
  toPeerId?: string;
  timestamp?: number;
  payload: Record<string, unknown>;
}): JsonMessage {
  return {
    type: 'transport',
    message: {
      source: 'roomful',
      protocolVersion: 2,
      codec: 'json',
      roomId: message.roomId,
      fromPeerId: message.fromPeerId,
      ...(message.toPeerId ? { toPeerId: message.toPeerId } : {}),
      timestamp: message.timestamp ?? 1,
      type: message.type,
      payload: message.payload,
    },
  };
}

function sendAndWaitForMessage(
  socket: WebSocket,
  payload: JsonMessage,
  predicate: (message: JsonMessage) => boolean,
  timeoutMs?: number,
): Promise<JsonMessage> {
  const pendingMessage = waitForMessage(socket, predicate, timeoutMs);
  send(socket, payload);
  return pendingMessage;
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  if (socket.readyState === WebSocket.CONNECTING) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        socket.off('close', onDone);
        socket.off('error', onDone);
        resolve();
      }, SOCKET_CLOSE_TIMEOUT_MS);

      const onDone = (): void => {
        clearTimeout(timer);
        socket.off('close', onDone);
        socket.off('error', onDone);
        resolve();
      };

      socket.once('close', onDone);
      socket.once('error', onDone);
    });
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      socket.off('close', onClose);
      socket.terminate();
      resolve();
    }, SOCKET_CLOSE_TIMEOUT_MS);

    const onClose = (): void => {
      clearTimeout(timer);
      resolve();
    };

    socket.once('close', onClose);
    socket.close();
  });
}

describe(
  'relay signaling server',
  {
    timeout: 30_000,
  },
  () => {
    let relayServer: RelayServer | null = null;
    const sockets: WebSocket[] = [];

    afterEach(async () => {
      await Promise.all(
        sockets.map((socket) => {
          return closeSocket(socket);
        }),
      );

      sockets.length = 0;

      await relayServer?.stop();
      relayServer = null;
      vi.restoreAllMocks();
    });

    it('joins peers into rooms and emits peer-joined', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB);

      await waitForOpen(clientA);
      await waitForOpen(clientB);

      const joinedA = await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-join',
          peerId: 'a',
        },
        (message) => message.type === 'joined',
      );
      expect(joinedA).toMatchObject({
        type: 'joined',
        roomId: 'room-join',
        peerId: 'a',
        peers: [],
      });

      const peerJoinedPromise = waitForMessage(
        clientA,
        (message) => message.type === 'peer-joined' && message.peerId === 'b',
      );
      const joinedB = await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-join',
          peerId: 'b',
        },
        (message) => message.type === 'joined',
      );
      expect(joinedB).toMatchObject({
        type: 'joined',
        roomId: 'room-join',
        peerId: 'b',
        peers: [{ peerId: 'a' }],
      });

      const peerJoinedA = await peerJoinedPromise;
      expect(peerJoinedA).toMatchObject({
        type: 'peer-joined',
        roomId: 'room-join',
        peerId: 'b',
      });
    });

    it('rejects messages beyond the configured rate limit', async () => {
      relayServer = createRelayServer({
        port: 0,
        messageRateLimit: {
          limit: 1,
          intervalMs: 60_000,
        },
      });
      await relayServer.start();

      const client = new WebSocket(relayServer.getAddress());
      sockets.push(client);
      await waitForOpen(client);

      const rateLimited = waitForMessage(
        client,
        (message) => message.type === 'error' && message.code === 'RATE_LIMITED',
      );

      // Burst several messages: only the first fits the one-token budget, the rest are rejected.
      send(client, { type: 'ping' });
      send(client, { type: 'ping' });
      send(client, { type: 'ping' });

      await expect(rateLimited).resolves.toMatchObject({
        type: 'error',
        code: 'RATE_LIMITED',
      });
    });

    it('rejects a new room beyond the room limit', async () => {
      relayServer = createRelayServer({
        port: 0,
        maxRooms: 1,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB);
      await waitForOpen(clientA);
      await waitForOpen(clientB);

      const joinedA = await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-1',
          peerId: 'a',
        },
        (message) => message.type === 'joined',
      );
      expect(joinedA).toMatchObject({
        type: 'joined',
        roomId: 'room-1',
      });

      const rejectedB = await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-2',
          peerId: 'b',
        },
        (message) => message.type === 'error',
      );
      expect(rejectedB).toMatchObject({
        type: 'error',
        code: 'ROOM_LIMIT',
      });
    });

    it('admits more peers into an existing room at the room limit', async () => {
      relayServer = createRelayServer({
        port: 0,
        maxRooms: 1,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB);
      await waitForOpen(clientA);
      await waitForOpen(clientB);

      await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-1',
          peerId: 'a',
        },
        (message) => message.type === 'joined',
      );

      const joinedB = await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-1',
          peerId: 'b',
        },
        (message) => message.type === 'joined',
      );
      expect(joinedB).toMatchObject({
        type: 'joined',
        roomId: 'room-1',
        peerId: 'b',
      });
    });

    it('enforces maxPeers using the first successful join capacity', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      const clientC = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB, clientC);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB), waitForOpen(clientC)]);

      const joinedA = await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-capacity',
          peerId: 'a',
          maxPeers: 2,
        },
        (message) => message.type === 'joined',
      );
      expect(joinedA).toMatchObject({
        type: 'joined',
        roomId: 'room-capacity',
        peerId: 'a',
      });

      const peerJoinedOnA = waitForMessage(
        clientA,
        (message) => message.type === 'peer-joined' && message.peerId === 'b',
      );
      const joinedB = await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-capacity',
          peerId: 'b',
          maxPeers: 5,
        },
        (message) => message.type === 'joined',
      );
      expect(joinedB).toMatchObject({
        type: 'joined',
        roomId: 'room-capacity',
        peerId: 'b',
        peers: [{ peerId: 'a' }],
      });
      await expect(peerJoinedOnA).resolves.toMatchObject({
        type: 'peer-joined',
        peerId: 'b',
      });

      const noPeerJoinedForRejectedJoin = waitForMessage(
        clientA,
        (message) => message.type === 'peer-joined' && message.peerId === 'c',
        150,
      )
        .then(() => true)
        .catch(() => false);
      const roomFullError = await sendAndWaitForMessage(
        clientC,
        {
          type: 'join',
          roomId: 'room-capacity',
          peerId: 'c',
          maxPeers: 10,
        },
        (message) => message.type === 'error',
      );
      expect(roomFullError).toMatchObject({
        type: 'error',
        code: 'ROOM_FULL',
        message: 'Room is full.',
      });
      await expect(noPeerJoinedForRejectedJoin).resolves.toBe(false);
    });

    it('routes signal messages to target peer only', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      const clientC = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB, clientC);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB), waitForOpen(clientC)]);

      for (const peerId of ['a', 'b', 'c']) {
        const client = peerId === 'a' ? clientA : peerId === 'b' ? clientB : clientC;
        send(client, {
          type: 'join',
          roomId: 'room-signal',
          peerId,
        });
        await waitForMessage(client, (message) => message.type === 'joined');
      }

      send(clientA, {
        type: 'signal',
        roomId: 'room-signal',
        fromPeerId: 'a',
        toPeerId: 'b',
        description: {
          type: 'offer',
          sdp: 'fake-sdp',
        },
      });

      const signalB = await waitForMessage(
        clientB,
        (message) => message.type === 'signal' && message.fromPeerId === 'a',
      );
      expect(signalB).toMatchObject({
        type: 'signal',
        roomId: 'room-signal',
        fromPeerId: 'a',
        toPeerId: 'b',
      });

      const noSignalForC = await waitForMessage(
        clientC,
        (message) => message.type === 'signal',
        150,
      )
        .then(() => true)
        .catch(() => false);
      expect(noSignalForC).toBe(false);
    });

    it('routes websocket transport messages for both targeted and broadcast delivery', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      const clientC = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB, clientC);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB), waitForOpen(clientC)]);

      for (const peerId of ['a', 'b', 'c']) {
        const client = peerId === 'a' ? clientA : peerId === 'b' ? clientB : clientC;
        send(client, {
          type: 'join',
          roomId: 'room-transport',
          peerId,
        });
        await waitForMessage(client, (message) => message.type === 'joined');
      }

      send(
        clientA,
        createTransportFrame({
          type: 'event',
          roomId: 'room-transport',
          fromPeerId: 'a',
          toPeerId: 'b',
          payload: {
            name: 'targeted',
            payload: {
              scope: 'one',
            },
          },
        }),
      );

      const targetedAtB = await waitForMessage(
        clientB,
        (message) =>
          message.type === 'transport' &&
          (message.message as { signal?: { fromPeerId?: string } } | undefined)?.signal
            ?.fromPeerId === 'a',
      );
      expect(targetedAtB).toMatchObject({
        type: 'transport',
        message: {
          source: 'roomful',
          version: 1,
          signal: {
            type: 'event',
            roomId: 'room-transport',
            fromPeerId: 'a',
            toPeerId: 'b',
            payload: {
              event: {
                name: 'targeted',
                payload: {
                  scope: 'one',
                },
              },
            },
          },
        },
      });

      const noTargetedAtC = await waitForMessage(
        clientC,
        (message) => message.type === 'transport',
        150,
      )
        .then(() => true)
        .catch(() => false);
      expect(noTargetedAtC).toBe(false);

      send(
        clientA,
        createTransportFrame({
          type: 'hello',
          roomId: 'room-transport',
          fromPeerId: 'a',
          payload: {
            peer: {
              id: 'a',
              joinedAt: 1,
              lastSeen: 1,
            },
          },
        }),
      );

      const broadcastAtB = await waitForMessage(
        clientB,
        (message) =>
          message.type === 'transport' &&
          (message.message as { signal?: { type?: string } } | undefined)?.signal?.type === 'hello',
      );
      const broadcastAtC = await waitForMessage(
        clientC,
        (message) =>
          message.type === 'transport' &&
          (message.message as { signal?: { type?: string } } | undefined)?.signal?.type === 'hello',
      );

      expect(broadcastAtB).toMatchObject({
        type: 'transport',
        message: {
          source: 'roomful',
          version: 1,
          signal: {
            type: 'hello',
            roomId: 'room-transport',
            fromPeerId: 'a',
          },
        },
      });
      expect(broadcastAtC).toMatchObject({
        type: 'transport',
        message: {
          source: 'roomful',
          version: 1,
          signal: {
            type: 'hello',
            roomId: 'room-transport',
            fromPeerId: 'a',
          },
        },
      });
    });

    it('forwards opaque encrypted websocket transport frames without inner payload fields', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);

      for (const peerId of ['a', 'b']) {
        const client = peerId === 'a' ? clientA : clientB;
        send(client, {
          type: 'join',
          roomId: 'room-transport-encrypted',
          peerId,
        });
        await waitForMessage(client, (message) => message.type === 'joined');
      }

      const encryptedPayload = {
        version: 1,
        iv: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        ciphertext: [21, 34, 55, 89],
      };

      send(
        clientA,
        createTransportFrame({
          type: 'encrypted',
          roomId: 'room-transport-encrypted',
          fromPeerId: 'a',
          toPeerId: 'b',
          payload: encryptedPayload,
        }),
      );

      const targetedAtB = await waitForMessage(
        clientB,
        (message) =>
          message.type === 'transport' &&
          (message.message as { signal?: { type?: string } } | undefined)?.signal?.type ===
            'encrypted',
      );

      expect(targetedAtB).toMatchObject({
        type: 'transport',
        message: {
          source: 'roomful',
          version: 1,
          signal: {
            type: 'encrypted',
            roomId: 'room-transport-encrypted',
            fromPeerId: 'a',
            toPeerId: 'b',
            payload: encryptedPayload,
          },
        },
      });

      const signal = (targetedAtB.message as { signal?: Record<string, unknown> }).signal;
      expect(signal).toBeDefined();
      expect(signal).not.toHaveProperty('payload.peer');
      expect(signal).not.toHaveProperty('payload.awareness');
      expect(signal).not.toHaveProperty('payload.event');
      expect(signal).not.toHaveProperty('payload.value');
    });

    it('routes offer, answer, and candidate payloads for WebRTC signaling', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      const clientC = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB, clientC);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB), waitForOpen(clientC)]);

      for (const peerId of ['a', 'b', 'c']) {
        const client = peerId === 'a' ? clientA : peerId === 'b' ? clientB : clientC;
        send(client, {
          type: 'join',
          roomId: 'room-webrtc-signal',
          peerId,
        });
        await waitForMessage(client, (message) => message.type === 'joined');
      }

      send(clientA, {
        type: 'signal',
        roomId: 'room-webrtc-signal',
        fromPeerId: 'a',
        toPeerId: 'b',
        description: {
          type: 'offer',
          sdp: 'offer-sdp',
        },
      });

      const offerAtB = await waitForMessage(
        clientB,
        (message) =>
          message.type === 'signal' &&
          message.fromPeerId === 'a' &&
          (message.description as { type?: string } | undefined)?.type === 'offer',
      );
      expect(offerAtB).toMatchObject({
        type: 'signal',
        roomId: 'room-webrtc-signal',
        fromPeerId: 'a',
        toPeerId: 'b',
        description: {
          type: 'offer',
          sdp: 'offer-sdp',
        },
      });

      send(clientB, {
        type: 'signal',
        roomId: 'room-webrtc-signal',
        fromPeerId: 'b',
        toPeerId: 'a',
        description: {
          type: 'answer',
          sdp: 'answer-sdp',
        },
      });

      const answerAtA = await waitForMessage(
        clientA,
        (message) =>
          message.type === 'signal' &&
          message.fromPeerId === 'b' &&
          (message.description as { type?: string } | undefined)?.type === 'answer',
      );
      expect(answerAtA).toMatchObject({
        type: 'signal',
        roomId: 'room-webrtc-signal',
        fromPeerId: 'b',
        toPeerId: 'a',
        description: {
          type: 'answer',
          sdp: 'answer-sdp',
        },
      });

      send(clientA, {
        type: 'signal',
        roomId: 'room-webrtc-signal',
        fromPeerId: 'a',
        toPeerId: 'b',
        candidate: {
          candidate: 'candidate:1',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      });

      const candidateAtB = await waitForMessage(
        clientB,
        (message) => message.type === 'signal' && message.fromPeerId === 'a' && !!message.candidate,
      );
      expect(candidateAtB).toMatchObject({
        type: 'signal',
        roomId: 'room-webrtc-signal',
        fromPeerId: 'a',
        toPeerId: 'b',
        candidate: {
          candidate: 'candidate:1',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      });

      const noSignalForC = await waitForMessage(
        clientC,
        (message) => message.type === 'signal',
        150,
      )
        .then(() => true)
        .catch(() => false);
      expect(noSignalForC).toBe(false);
    });

    it('emits peer-left when a peer leaves', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB);

      await waitForOpen(clientA);
      await waitForOpen(clientB);

      send(clientA, {
        type: 'join',
        roomId: 'room-leave',
        peerId: 'a',
      });
      await waitForMessage(clientA, (message) => message.type === 'joined');

      send(clientB, {
        type: 'join',
        roomId: 'room-leave',
        peerId: 'b',
      });
      await waitForMessage(clientB, (message) => message.type === 'joined');

      const peerLeftPromise = waitForMessage(
        clientA,
        (message) => message.type === 'peer-left' && message.peerId === 'b',
      );
      send(clientB, {
        type: 'leave',
        roomId: 'room-leave',
        peerId: 'b',
      });
      const peerLeft = await peerLeftPromise;
      expect(peerLeft).toMatchObject({
        type: 'peer-left',
        roomId: 'room-leave',
        peerId: 'b',
      });
    });

    it('returns protocol error on invalid messages', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const client = new WebSocket(relayServer.getAddress());
      sockets.push(client);
      await waitForOpen(client);

      client.send('{"invalid":true}');
      const error = await waitForMessage(client, (message) => message.type === 'error');
      expect(error).toMatchObject({
        type: 'error',
        code: 'INVALID_MESSAGE',
      });
    });

    it('keeps rooms open by default and ignores unused query tokens', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const client = new WebSocket(withQueryTokens(relayServer.getAddress(), 'unused-token'));
      sockets.push(client);
      await waitForOpen(client);

      const joined = await sendAndWaitForMessage(
        client,
        {
          type: 'join',
          roomId: 'room-open',
          peerId: 'peer-a',
        },
        (message) => message.type === 'joined',
      );

      expect(joined).toMatchObject({
        type: 'joined',
        roomId: 'room-open',
        peerId: 'peer-a',
        peers: [],
      });
    });

    it('configures auth handlers with auth() and authenticates joins using query tokens', async () => {
      const auth = vi.fn(async () => {
        return undefined;
      });
      const relay = createRelayServer({
        port: 0,
      });
      relayServer = relay.auth(auth);
      expect(relayServer).toBe(relay);

      await relayServer.start();

      const client = new WebSocket(withQueryTokens(relayServer.getAddress(), 'allow'));
      sockets.push(client);
      await waitForOpen(client);

      const joined = await sendAndWaitForMessage(
        client,
        {
          type: 'join',
          roomId: 'room-auth',
          peerId: 'peer-a',
        },
        (message) => message.type === 'joined',
      );

      expect(joined).toMatchObject({
        type: 'joined',
        roomId: 'room-auth',
        peerId: 'peer-a',
      });
      expect(auth).toHaveBeenCalledWith('peer-a', 'room-auth', 'allow');
    });

    it('rejects missing, empty, and duplicate auth query tokens during upgrade', async () => {
      relayServer = createRelayServer({
        port: 0,
      }).auth(async () => {
        return undefined;
      });
      await relayServer.start();

      const missingTokenClient = new WebSocket(relayServer.getAddress());
      const emptyTokenClient = new WebSocket(withQueryTokens(relayServer.getAddress(), ''));
      const duplicateTokenClient = new WebSocket(
        withQueryTokens(relayServer.getAddress(), 'first', 'second'),
      );
      sockets.push(missingTokenClient, emptyTokenClient, duplicateTokenClient);

      const missingTokenRejection = waitForUpgradeRejection(missingTokenClient);
      const emptyTokenRejection = waitForUpgradeRejection(emptyTokenClient);
      const duplicateTokenRejection = waitForUpgradeRejection(duplicateTokenClient);

      await expect(missingTokenRejection).resolves.toBe(401);
      await expect(emptyTokenRejection).resolves.toBe(401);
      await expect(duplicateTokenRejection).resolves.toBe(401);
    });

    it('rejects unauthorized joins, logs the peer IP, and closes with 4401', async () => {
      const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => {
        return true;
      });

      relayServer = createRelayServer({
        port: 0,
      }).auth(async (_peerId, _roomId, token) => {
        if (token !== 'allow') {
          throw new Error('token denied');
        }

        return undefined;
      });
      await relayServer.start();

      const deniedClient = new WebSocket(withQueryTokens(relayServer.getAddress(), 'deny'), {
        headers: {
          'x-forwarded-for': '203.0.113.10',
        },
      });
      sockets.push(deniedClient);
      await waitForOpen(deniedClient);

      send(deniedClient, {
        type: 'join',
        roomId: 'room-auth',
        peerId: 'peer-a',
      });

      const error = await waitForMessage(deniedClient, (message) => message.type === 'error');
      const close = await waitForClose(deniedClient);
      expect(error).toMatchObject({
        type: 'error',
        code: 'AUTH_FAILED',
      });
      expect(close).toEqual({
        code: 4401,
        reason: 'auth-failed',
      });
      expect(stderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('ip=203.0.113.10 roomId=room-auth peerId=peer-a'),
      );

      const allowedClient = new WebSocket(withQueryTokens(relayServer.getAddress(), 'allow'));
      sockets.push(allowedClient);
      await waitForOpen(allowedClient);

      const joined = await sendAndWaitForMessage(
        allowedClient,
        {
          type: 'join',
          roomId: 'room-auth',
          peerId: 'peer-b',
        },
        (message) => message.type === 'joined',
      );

      expect(joined).toMatchObject({
        type: 'joined',
        roomId: 'room-auth',
        peerId: 'peer-b',
        peers: [],
      });
    });

    it('supports the deprecated authorize alias with query tokens and request context', async () => {
      const authorize = vi.fn(async ({ token }) => token === 'allow');

      relayServer = createRelayServer({
        port: 0,
        authorize,
      });
      await relayServer.start();

      const client = new WebSocket(withQueryTokens(relayServer.getAddress(), 'allow'));
      sockets.push(client);
      await waitForOpen(client);

      const joined = await sendAndWaitForMessage(
        client,
        {
          type: 'join',
          roomId: 'room-authorize',
          peerId: 'peer-a',
        },
        (message) => message.type === 'joined',
      );

      expect(joined).toMatchObject({
        type: 'joined',
        roomId: 'room-authorize',
        peerId: 'peer-a',
        peers: [],
      });
      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 'room-authorize',
          peerId: 'peer-a',
          token: 'allow',
          request: expect.objectContaining({
            url: expect.stringContaining('token=allow'),
          }),
        }),
      );
    });

    it('throws when auth() is combined with authorize', () => {
      const relay = createRelayServer({
        port: 0,
        authorize: async () => true,
      });

      expect(() => relay.auth(async () => undefined)).toThrowError(
        /both `authorize` and `auth\(\)`/i,
      );
    });

    it('validates join and signal invariants', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB);

      await waitForOpen(clientA);
      await waitForOpen(clientB);

      const notJoinedError = await sendAndWaitForMessage(
        clientA,
        {
          type: 'signal',
          roomId: 'room-checks',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          description: {
            type: 'offer',
            sdp: 'v=0',
          },
        },
        (message) => message.type === 'error',
      );
      expect(notJoinedError).toMatchObject({
        code: 'NOT_JOINED',
      });

      const transportNotJoinedError = await sendAndWaitForMessage(
        clientA,
        createTransportFrame({
          type: 'event',
          roomId: 'room-checks',
          fromPeerId: 'peer-a',
          payload: {
            name: 'ping',
            payload: true,
          },
        }),
        (message) => message.type === 'error',
      );
      expect(transportNotJoinedError).toMatchObject({
        code: 'NOT_JOINED',
      });

      await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-checks',
          peerId: 'peer-a',
        },
        (message) => message.type === 'joined',
      );

      const alreadyJoinedError = await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-checks',
          peerId: 'peer-z',
        },
        (message) => message.type === 'error',
      );
      expect(alreadyJoinedError).toMatchObject({
        code: 'ALREADY_JOINED',
      });

      const peerExistsError = await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-checks',
          peerId: 'peer-a',
        },
        (message) => message.type === 'error',
      );
      expect(peerExistsError).toMatchObject({
        code: 'PEER_EXISTS',
      });

      await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-checks',
          peerId: 'peer-b',
        },
        (message) => message.type === 'joined',
      );

      const roomMismatchError = await sendAndWaitForMessage(
        clientA,
        {
          type: 'signal',
          roomId: 'room-other',
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          description: {
            type: 'offer',
            sdp: 'v=0',
          },
        },
        (message) => message.type === 'error',
      );
      expect(roomMismatchError).toMatchObject({
        code: 'ROOM_MISMATCH',
      });

      const senderMismatchError = await sendAndWaitForMessage(
        clientA,
        {
          type: 'signal',
          roomId: 'room-checks',
          fromPeerId: 'peer-not-a',
          toPeerId: 'peer-b',
          description: {
            type: 'offer',
            sdp: 'v=0',
          },
        },
        (message) => message.type === 'error',
      );
      expect(senderMismatchError).toMatchObject({
        code: 'PEER_MISMATCH',
      });

      const transportRoomMismatchError = await sendAndWaitForMessage(
        clientA,
        createTransportFrame({
          type: 'event',
          roomId: 'room-other',
          fromPeerId: 'peer-a',
          payload: {
            name: 'ping',
            payload: true,
          },
        }),
        (message) => message.type === 'error',
      );
      expect(transportRoomMismatchError).toMatchObject({
        code: 'ROOM_MISMATCH',
      });

      const transportSenderMismatchError = await sendAndWaitForMessage(
        clientA,
        createTransportFrame({
          type: 'event',
          roomId: 'room-checks',
          fromPeerId: 'peer-not-a',
          payload: {
            name: 'ping',
            payload: true,
          },
        }),
        (message) => message.type === 'error',
      );
      expect(transportSenderMismatchError).toMatchObject({
        code: 'PEER_MISMATCH',
      });

      const leaveMismatchError = await sendAndWaitForMessage(
        clientA,
        {
          type: 'leave',
          roomId: 'room-checks',
          peerId: 'peer-not-a',
        },
        (message) => message.type === 'error',
      );
      expect(leaveMismatchError).toMatchObject({
        code: 'PEER_MISMATCH',
      });
    });

    it('serves health checks and 404s on the shared http listener', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const healthResponse = await fetch(toHttpUrl(relayServer.getAddress(), '/health'));
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.headers.get('content-type')).toContain('application/json');
      await expect(healthResponse.json()).resolves.toEqual({
        status: 'ok',
      });

      const notFoundResponse = await fetch(toHttpUrl(relayServer.getAddress(), '/missing'));
      expect(notFoundResponse.status).toBe(404);
    });

    it('supports polling sessions alongside websocket peers for transport delivery', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const websocketPeer = new WebSocket(relayServer.getAddress());
      sockets.push(websocketPeer);
      await waitForOpen(websocketPeer);

      send(websocketPeer, {
        type: 'join',
        roomId: 'room-polling-mixed',
        peerId: 'ws-a',
      });
      await waitForMessage(websocketPeer, (message) => message.type === 'joined');

      const peerJoinedAtWsPromise = waitForMessage(
        websocketPeer,
        (message) => message.type === 'peer-joined' && message.peerId === 'poll-b',
      );
      const pollingJoinResponse = await createPollingSession(relayServer.getAddress(), {
        type: 'join',
        roomId: 'room-polling-mixed',
        peerId: 'poll-b',
      });
      expect(pollingJoinResponse.status).toBe(200);
      const pollingJoin = (await pollingJoinResponse.json()) as {
        sessionId: string;
        peers: Array<{ peerId: string }>;
      };
      expect(pollingJoin.peers).toEqual([
        {
          peerId: 'ws-a',
        },
      ]);

      const peerJoinedAtWs = await peerJoinedAtWsPromise;
      expect(peerJoinedAtWs).toMatchObject({
        type: 'peer-joined',
        roomId: 'room-polling-mixed',
        peerId: 'poll-b',
      });

      const transportToWs = waitForMessage(
        websocketPeer,
        (message) =>
          message.type === 'transport' &&
          (message.message as { signal?: { fromPeerId?: string } } | undefined)?.signal
            ?.fromPeerId === 'poll-b',
      );
      const pollingSendResponse = await sendPollingTransport(
        relayServer.getAddress(),
        pollingJoin.sessionId,
        createTransportFrame({
          type: 'event',
          roomId: 'room-polling-mixed',
          fromPeerId: 'poll-b',
          toPeerId: 'ws-a',
          payload: {
            name: 'from-polling',
            payload: {
              ok: true,
            },
          },
        }),
      );
      expect(pollingSendResponse.status).toBe(202);
      await expect(transportToWs).resolves.toMatchObject({
        type: 'transport',
        message: {
          signal: {
            fromPeerId: 'poll-b',
            toPeerId: 'ws-a',
          },
        },
      });

      send(
        websocketPeer,
        createTransportFrame({
          type: 'event',
          roomId: 'room-polling-mixed',
          fromPeerId: 'ws-a',
          payload: {
            name: 'from-websocket',
            payload: {
              ok: true,
            },
          },
        }),
      );

      const pollingEventResponse = await waitForPollingEvent(
        relayServer.getAddress(),
        pollingJoin.sessionId,
      );
      expect(pollingEventResponse.status).toBe(200);
      await expect(pollingEventResponse.json()).resolves.toMatchObject({
        type: 'transport',
        message: {
          signal: {
            fromPeerId: 'ws-a',
            type: 'event',
          },
        },
      });

      const peerLeftAtWsPromise = waitForMessage(
        websocketPeer,
        (message) => message.type === 'peer-left' && message.peerId === 'poll-b',
      );
      const deleteResponse = await deletePollingSession(
        relayServer.getAddress(),
        pollingJoin.sessionId,
      );
      expect(deleteResponse.status).toBe(204);

      const peerLeftAtWs = await peerLeftAtWsPromise;
      expect(peerLeftAtWs).toMatchObject({
        type: 'peer-left',
        roomId: 'room-polling-mixed',
        peerId: 'poll-b',
      });
    });

    it('forwards opaque encrypted transport frames between polling and websocket peers', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const websocketPeer = new WebSocket(relayServer.getAddress());
      sockets.push(websocketPeer);
      await waitForOpen(websocketPeer);

      send(websocketPeer, {
        type: 'join',
        roomId: 'room-polling-encrypted',
        peerId: 'ws-a',
      });
      await waitForMessage(websocketPeer, (message) => message.type === 'joined');

      const pollingJoinResponse = await createPollingSession(relayServer.getAddress(), {
        type: 'join',
        roomId: 'room-polling-encrypted',
        peerId: 'poll-b',
      });
      expect(pollingJoinResponse.status).toBe(200);
      const pollingJoin = (await pollingJoinResponse.json()) as { sessionId: string };

      const pollingToWebsocketPayload = {
        version: 1,
        iv: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        ciphertext: [144, 55, 233, 8],
      };
      const transportToWs = waitForMessage(
        websocketPeer,
        (message) =>
          message.type === 'transport' &&
          (message.message as { signal?: { type?: string; fromPeerId?: string } } | undefined)
            ?.signal?.type === 'encrypted' &&
          (message.message as { signal?: { fromPeerId?: string } } | undefined)?.signal
            ?.fromPeerId === 'poll-b',
      );

      const pollingSendResponse = await sendPollingTransport(
        relayServer.getAddress(),
        pollingJoin.sessionId,
        createTransportFrame({
          type: 'encrypted',
          roomId: 'room-polling-encrypted',
          fromPeerId: 'poll-b',
          toPeerId: 'ws-a',
          payload: pollingToWebsocketPayload,
        }),
      );
      expect(pollingSendResponse.status).toBe(202);

      const websocketMessage = await transportToWs;
      expect(websocketMessage).toMatchObject({
        type: 'transport',
        message: {
          signal: {
            type: 'encrypted',
            roomId: 'room-polling-encrypted',
            fromPeerId: 'poll-b',
            toPeerId: 'ws-a',
            payload: pollingToWebsocketPayload,
          },
        },
      });

      const websocketSignal = (websocketMessage.message as { signal?: Record<string, unknown> })
        .signal;
      expect(websocketSignal).toBeDefined();
      expect(websocketSignal).not.toHaveProperty('payload.peer');
      expect(websocketSignal).not.toHaveProperty('payload.awareness');
      expect(websocketSignal).not.toHaveProperty('payload.event');
      expect(websocketSignal).not.toHaveProperty('payload.value');

      const websocketToPollingPayload = {
        version: 1,
        iv: [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8],
        ciphertext: [13, 21, 34, 55],
      };

      send(
        websocketPeer,
        createTransportFrame({
          type: 'encrypted',
          roomId: 'room-polling-encrypted',
          fromPeerId: 'ws-a',
          toPeerId: 'poll-b',
          payload: websocketToPollingPayload,
        }),
      );

      const pollingEventResponse = await waitForPollingEvent(
        relayServer.getAddress(),
        pollingJoin.sessionId,
      );
      expect(pollingEventResponse.status).toBe(200);

      const pollingMessage = (await pollingEventResponse.json()) as {
        type: string;
        message: {
          signal?: Record<string, unknown>;
        };
      };

      expect(pollingMessage).toMatchObject({
        type: 'transport',
        message: {
          signal: {
            type: 'encrypted',
            roomId: 'room-polling-encrypted',
            fromPeerId: 'ws-a',
            toPeerId: 'poll-b',
            payload: websocketToPollingPayload,
          },
        },
      });
      expect(pollingMessage.message.signal).not.toHaveProperty('payload.peer');
      expect(pollingMessage.message.signal).not.toHaveProperty('payload.awareness');
      expect(pollingMessage.message.signal).not.toHaveProperty('payload.event');
      expect(pollingMessage.message.signal).not.toHaveProperty('payload.value');

      await expect(
        deletePollingSession(relayServer.getAddress(), pollingJoin.sessionId),
      ).resolves.toMatchObject({
        status: 204,
      });
    });

    it('returns 204 when a polling event request times out with no queued messages', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const pollingJoinResponse = await createPollingSession(relayServer.getAddress(), {
        type: 'join',
        roomId: 'room-polling-timeout',
        peerId: 'poll-a',
      });
      const pollingJoin = (await pollingJoinResponse.json()) as { sessionId: string };

      const eventResponse = await waitForPollingEvent(
        relayServer.getAddress(),
        pollingJoin.sessionId,
        10,
      );
      expect(eventResponse.status).toBe(204);

      await deletePollingSession(relayServer.getAddress(), pollingJoin.sessionId);
    });

    it('requires bearer auth for polling joins when relay auth is enabled', async () => {
      relayServer = createRelayServer({
        port: 0,
      }).auth(async (_peerId, _roomId, token) => {
        return token === 'allow';
      });
      await relayServer.start();

      const missingAuthResponse = await createPollingSession(relayServer.getAddress(), {
        type: 'join',
        roomId: 'room-polling-auth',
        peerId: 'poll-a',
      });
      expect(missingAuthResponse.status).toBe(401);
      await expect(missingAuthResponse.json()).resolves.toMatchObject({
        code: 'AUTH_FAILED',
      });

      const allowedResponse = await createPollingSession(
        relayServer.getAddress(),
        {
          type: 'join',
          roomId: 'room-polling-auth',
          peerId: 'poll-a',
        },
        'allow',
      );
      expect(allowedResponse.status).toBe(200);
      const allowedJoin = (await allowedResponse.json()) as { sessionId: string };
      await deletePollingSession(relayServer.getAddress(), allowedJoin.sessionId);
    });

    it('rejects websocket upgrades when maxConnections is reached', async () => {
      relayServer = createRelayServer({
        port: 0,
        maxConnections: 1,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      sockets.push(clientA);
      await waitForOpen(clientA);

      const clientB = new WebSocket(relayServer.getAddress());
      sockets.push(clientB);
      await expect(waitForUpgradeRejection(clientB)).resolves.toBe(503);
    });

    it('forwards msgpack transport frames unchanged to msgpack peers and re-encodes legacy peers', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      const clientC = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB, clientC);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB), waitForOpen(clientC)]);

      await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-msgpack-forward',
          peerId: 'a',
          protocol: MSGPACK_PROTOCOL,
        },
        (message) => message.type === 'joined',
      );

      const peerJoinedAtAForB = waitForMessage(
        clientA,
        (message) => message.type === 'peer-joined' && message.peerId === 'b',
      );
      await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-msgpack-forward',
          peerId: 'b',
          protocol: MSGPACK_PROTOCOL,
        },
        (message) => message.type === 'joined',
      );
      await peerJoinedAtAForB;

      const peerJoinedAtAForC = waitForMessage(
        clientA,
        (message) => message.type === 'peer-joined' && message.peerId === 'c',
      );
      const peerJoinedAtBForC = waitForMessage(
        clientB,
        (message) => message.type === 'peer-joined' && message.peerId === 'c',
      );
      await sendAndWaitForMessage(
        clientC,
        {
          type: 'join',
          roomId: 'room-msgpack-forward',
          peerId: 'c',
        },
        (message) => message.type === 'joined',
      );
      await Promise.all([peerJoinedAtAForC, peerJoinedAtBForC]);

      const rawBinaryPayload = new Uint8Array(
        encode({
          type: 'transport',
          message: {
            source: 'roomful',
            protocolVersion: 2,
            codec: 'msgpack',
            roomId: 'room-msgpack-forward',
            fromPeerId: 'a',
            timestamp: 9,
            type: 'event',
            payload: {
              name: 'sync',
              payload: {
                scope: 'mixed-room',
              },
            },
          },
        }),
      );

      const binaryAtB = waitForRawMessage(clientB, (_data, isBinary) => isBinary);
      const jsonAtC = waitForRawMessage(clientC, (data, isBinary) => {
        if (isBinary) {
          return false;
        }

        const parsed = JSON.parse(toUtf8(data)) as JsonMessage;
        return parsed.type === 'transport';
      });

      clientA.send(rawBinaryPayload);

      const receivedAtB = await binaryAtB;
      expect(receivedAtB.isBinary).toBe(true);
      expect(Buffer.from(receivedAtB.data as ArrayBuffer)).toEqual(Buffer.from(rawBinaryPayload));

      const receivedAtC = await jsonAtC;
      expect(receivedAtC.isBinary).toBe(false);
      expect(JSON.parse(toUtf8(receivedAtC.data))).toMatchObject({
        type: 'transport',
        message: {
          source: 'roomful',
          version: 1,
          signal: {
            type: 'event',
            roomId: 'room-msgpack-forward',
            fromPeerId: 'a',
            payload: {
              event: {
                name: 'sync',
                payload: {
                  scope: 'mixed-room',
                },
              },
            },
          },
        },
      });
    });

    it('gracefully shuts down active websocket clients and frees the listening port', async () => {
      relayServer = createRelayServer({
        port: 0,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB);

      await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);

      await sendAndWaitForMessage(
        clientA,
        {
          type: 'join',
          roomId: 'room-stop',
          peerId: 'a',
        },
        (message) => message.type === 'joined',
      );

      const peerJoinedAtA = waitForMessage(
        clientA,
        (message) => message.type === 'peer-joined' && message.peerId === 'b',
      );
      await sendAndWaitForMessage(
        clientB,
        {
          type: 'join',
          roomId: 'room-stop',
          peerId: 'b',
        },
        (message) => message.type === 'joined',
      );
      await peerJoinedAtA;

      const closeA = waitForClose(clientA);
      const closeB = waitForClose(clientB);
      const port = Number(new URL(relayServer.getAddress()).port);

      await relayServer.stop();
      relayServer = null;

      await expect(closeA).resolves.toMatchObject({
        code: 1000,
        reason: 'server-stop',
      });
      await expect(closeB).resolves.toMatchObject({
        code: 1000,
        reason: 'server-stop',
      });

      const replacementServer = createRelayServer({
        port,
      });
      await replacementServer.start();
      await replacementServer.stop();
    });
  },
);

registerRedisIntegrationTests();

function encodeBase64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createRelayJwt(payload: Record<string, unknown>, secret: string): string {
  const encodedHeader = encodeBase64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encodeBase64UrlJson(payload);
  const encodedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

describe(
  'relay configuration',
  {
    timeout: 30_000,
  },
  () => {
    let relayServer: RelayServer | null = null;
    const sockets: WebSocket[] = [];

    afterEach(async () => {
      await Promise.all(
        sockets.map((socket) => {
          return closeSocket(socket);
        }),
      );
      sockets.length = 0;
      await relayServer?.stop();
      relayServer = null;
      vi.restoreAllMocks();
    });

    it('rejects joins beyond the configured maxRoomSize', async () => {
      relayServer = createRelayServer({
        port: 0,
        maxRoomSize: 2,
      });
      await relayServer.start();

      const clientA = new WebSocket(relayServer.getAddress());
      const clientB = new WebSocket(relayServer.getAddress());
      const clientC = new WebSocket(relayServer.getAddress());
      sockets.push(clientA, clientB, clientC);
      await waitForOpen(clientA);
      await waitForOpen(clientB);
      await waitForOpen(clientC);

      await sendAndWaitForMessage(
        clientA,
        { type: 'join', roomId: 'room-cap', peerId: 'a' },
        (message) => message.type === 'joined',
      );
      await sendAndWaitForMessage(
        clientB,
        { type: 'join', roomId: 'room-cap', peerId: 'b' },
        (message) => message.type === 'joined',
      );
      const rejected = await sendAndWaitForMessage(
        clientC,
        { type: 'join', roomId: 'room-cap', peerId: 'c' },
        (message) => message.type === 'error',
      );

      expect(rejected).toMatchObject({
        type: 'error',
        code: 'ROOM_FULL',
      });
    });

    it('serves CORS headers and answers preflight when corsOrigin is set', async () => {
      relayServer = createRelayServer({
        port: 0,
        corsOrigin: 'https://app.example.com',
      });
      await relayServer.start();

      const healthResponse = await fetch(toHttpUrl(relayServer.getAddress(), '/health'));
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.headers.get('access-control-allow-origin')).toBe(
        'https://app.example.com',
      );

      const preflight = await fetch(toHttpUrl(relayServer.getAddress(), '/health'), {
        method: 'OPTIONS',
      });
      expect(preflight.status).toBe(204);
    });

    it('rejects WebSocket upgrades from a disallowed origin', async () => {
      relayServer = createRelayServer({
        port: 0,
        corsOrigin: 'https://app.example.com',
      });
      await relayServer.start();

      const blocked = new WebSocket(relayServer.getAddress(), {
        origin: 'https://evil.example.com',
      });
      sockets.push(blocked);
      const status = await waitForUpgradeRejection(blocked);
      expect(status).toBe(403);
    });

    it('enforces JWT authorization when authSecret is configured', async () => {
      relayServer = createRelayServer({
        port: 0,
        authSecret: 'relay-secret',
      });
      await relayServer.start();

      const unauthenticated = new WebSocket(relayServer.getAddress());
      sockets.push(unauthenticated);
      expect(await waitForUpgradeRejection(unauthenticated)).toBe(401);

      const token = createRelayJwt(
        { sub: 'peer-a', exp: Math.floor(Date.now() / 1_000) + 60 },
        'relay-secret',
      );
      const authenticated = new WebSocket(withQueryTokens(relayServer.getAddress(), token));
      sockets.push(authenticated);
      await waitForOpen(authenticated);
      const joined = await sendAndWaitForMessage(
        authenticated,
        { type: 'join', roomId: 'room-auth', peerId: 'peer-a' },
        (message) => message.type === 'joined',
      );
      expect(joined).toMatchObject({
        type: 'joined',
        roomId: 'room-auth',
        peerId: 'peer-a',
      });
    });
  },
);
