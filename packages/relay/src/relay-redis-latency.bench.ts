import { performance } from 'node:perf_hooks';

import { afterAll, beforeAll, bench, describe, expect } from 'vitest';
import { WebSocket } from 'ws';

import { isObject } from './internal/guards.js';
import { createRelayServer, type RelayServer } from './server.js';

interface BenchmarkClientPair {
  receiver: WebSocket;
  sender: WebSocket;
}

interface BenchmarkScenario {
  clients: BenchmarkClientPair;
  roomId: string;
  senderPeerId: string;
  servers: RelayServer[];
}

const SOCKET_TIMEOUT_MS = 2_000;
const redisUrl = process.env.ROOMFUL_REDIS_URL;
const runBenchmarks = typeof redisUrl === 'string' && redisUrl.length > 0;

function toUtf8(data: WebSocket.RawData): string {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }

  return Buffer.from(data).toString('utf8');
}

function parseJsonUnknown(value: string): unknown {
  return JSON.parse(value);
}

function parseTransportLatency(payload: string): { name?: string; sentAt?: number } | null {
  const parsed = parseJsonUnknown(payload);
  if (!isObject(parsed) || parsed['type'] !== 'transport') {
    return null;
  }

  const message = parsed['message'];
  if (!isObject(message)) {
    return null;
  }

  const signal = message['signal'];
  if (!isObject(signal) || signal['type'] !== 'event') {
    return null;
  }

  const payloadRecord = signal['payload'];
  if (!isObject(payloadRecord)) {
    return null;
  }

  const event = payloadRecord['event'];
  if (!isObject(event)) {
    return null;
  }

  const eventPayload = event['payload'];
  const name = event['name'];
  return {
    ...(typeof name === 'string' ? { name } : {}),
    ...(isObject(eventPayload) && typeof eventPayload['sentAt'] === 'number'
      ? { sentAt: eventPayload['sentAt'] }
      : {}),
  };
}

function parseJoinedAck(payload: string): { type?: string; peerId?: string } | null {
  const parsed = parseJsonUnknown(payload);
  if (!isObject(parsed)) {
    return null;
  }

  return {
    ...(typeof parsed['type'] === 'string' ? { type: parsed['type'] } : {}),
    ...(typeof parsed['peerId'] === 'string' ? { peerId: parsed['peerId'] } : {}),
  };
}

function requireScenario(scenario: BenchmarkScenario | null): BenchmarkScenario {
  expect(scenario).not.toBeNull();
  if (scenario === null) {
    throw new TypeError('Benchmark scenario was not initialized.');
  }

  return scenario;
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = (): void => {
      socket.off('error', onError);
      resolve();
    };

    const onError = (error: Error): void => {
      socket.off('open', onOpen);
      reject(error);
    };

    socket.once('open', onOpen);
    socket.once('error', onError);
  });
}

function send(socket: WebSocket, payload: Record<string, unknown>): void {
  socket.send(JSON.stringify(payload));
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      socket.off('close', onClose);
      socket.terminate();
      resolve();
    }, SOCKET_TIMEOUT_MS);

    const onClose = (): void => {
      clearTimeout(timer);
      resolve();
    };

    socket.once('close', onClose);
    socket.close();
  });
}

function waitForTransportEvent(socket: WebSocket, eventName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for transport event "${eventName}".`));
    }, SOCKET_TIMEOUT_MS);

    const onMessage = (rawData: WebSocket.RawData): void => {
      const payload = toUtf8(rawData);
      const parsed = parseTransportLatency(payload);
      if (!parsed) {
        return;
      }

      const receivedName = parsed.name;
      const sentAt = parsed.sentAt;
      if (receivedName !== eventName || typeof sentAt !== 'number') {
        return;
      }

      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(performance.now() - sentAt);
    };

    socket.on('message', onMessage);
  });
}

async function createJoinedClient(
  server: RelayServer,
  roomId: string,
  peerId: string,
): Promise<WebSocket> {
  const socket = new WebSocket(server.getAddress());
  await waitForOpen(socket);

  const joined = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for join ack for ${peerId}.`));
    }, SOCKET_TIMEOUT_MS);

    const onMessage = (rawData: WebSocket.RawData): void => {
      const payload = toUtf8(rawData);
      const parsed = parseJoinedAck(payload);
      if (!parsed || parsed.type !== 'joined' || parsed.peerId !== peerId) {
        return;
      }

      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve();
    };

    socket.on('message', onMessage);
  });

  send(socket, {
    type: 'join',
    roomId,
    peerId,
  });
  await joined;
  return socket;
}

async function createLocalScenario(): Promise<BenchmarkScenario> {
  const server = createRelayServer({
    port: 0,
  });
  await server.start();

  const sender = await createJoinedClient(server, 'bench-local-room', 'local-a');
  const receiver = await createJoinedClient(server, 'bench-local-room', 'local-b');

  return {
    clients: {
      sender,
      receiver,
    },
    roomId: 'bench-local-room',
    senderPeerId: 'local-a',
    servers: [server],
  };
}

async function createRedisScenario(url: string): Promise<BenchmarkScenario> {
  const serverA = createRelayServer({
    port: 0,
    redisUrl: url,
  });
  const serverB = createRelayServer({
    port: 0,
    redisUrl: url,
  });
  await Promise.all([serverA.start(), serverB.start()]);

  const sender = await createJoinedClient(serverA, 'bench-redis-room', 'redis-a');
  const receiver = await createJoinedClient(serverB, 'bench-redis-room', 'redis-b');

  return {
    clients: {
      sender,
      receiver,
    },
    roomId: 'bench-redis-room',
    senderPeerId: 'redis-a',
    servers: [serverA, serverB],
  };
}

async function measureEventLatency(
  scenario: BenchmarkScenario,
  eventName: string,
): Promise<number> {
  const pendingLatency = waitForTransportEvent(scenario.clients.receiver, eventName);
  send(scenario.clients.sender, {
    type: 'transport',
    message: {
      source: 'roomful',
      protocolVersion: 2,
      codec: 'json',
      roomId: scenario.roomId,
      fromPeerId: scenario.senderPeerId,
      timestamp: Date.now(),
      type: 'event',
      payload: {
        name: eventName,
        payload: {
          sentAt: performance.now(),
        },
      },
    },
  });
  return pendingLatency;
}

const maybeDescribe = runBenchmarks ? describe : describe.skip;

maybeDescribe('relay redis latency benchmark', () => {
  let localScenario: BenchmarkScenario | null = null;
  let redisScenario: BenchmarkScenario | null = null;
  let sampleId = 0;

  beforeAll(async () => {
    expect(redisUrl).toBeTruthy();
    localScenario = await createLocalScenario();
    redisScenario = await createRedisScenario(redisUrl ?? '');
  });

  afterAll(async () => {
    const scenarios = [localScenario, redisScenario].filter(
      (scenario): scenario is BenchmarkScenario => scenario !== null,
    );

    await Promise.all(
      scenarios.flatMap((scenario) => {
        return [
          closeSocket(scenario.clients.sender),
          closeSocket(scenario.clients.receiver),
          ...scenario.servers.map((server) => server.stop()),
        ];
      }),
    );
  });

  bench(
    'single-instance event latency',
    async () => {
      await measureEventLatency(requireScenario(localScenario), `local-${sampleId++}`);
    },
    {
      iterations: 50,
    },
  );

  bench(
    'redis cross-instance event latency',
    async () => {
      await measureEventLatency(requireScenario(redisScenario), `redis-${sampleId++}`);
    },
    {
      iterations: 50,
    },
  );
});
