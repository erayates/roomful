import process from 'node:process';

import { createRelayServer } from '../../../packages/relay/dist/index.js';

function readPositiveInteger(value, name) {
  if (value === undefined) {
    throw new TypeError(`Missing ${name} value.`);
  }

  if (!/^\d+$/.test(value)) {
    throw new TypeError(`Invalid ${name} value "${value}".`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TypeError(`Invalid ${name} value "${value}".`);
  }

  return parsed;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function sendMessage(message) {
  if (typeof process.send === 'function') {
    process.send(message);
  }
}

async function main() {
  const instanceId = process.env.RELAY_INSTANCE_ID ?? `relay-${process.pid}`;
  const port = readPositiveInteger(process.env.PORT, 'PORT');
  const host = process.env.HOST ?? '127.0.0.1';
  const redisUrl = process.env.CAHOOTS_REDIS_URL;

  const server = createRelayServer({
    port,
    host,
    ...(typeof redisUrl === 'string' && redisUrl.length > 0 ? { redisUrl } : {}),
  });

  const shutdown = async () => {
    await server.stop().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });

  process.on('message', (message) => {
    if (!isObject(message) || typeof message.type !== 'string') {
      return;
    }

    if (message.type === 'snapshot' && typeof message.requestId === 'string') {
      const memoryUsage = process.memoryUsage();
      sendMessage({
        type: 'snapshot',
        requestId: message.requestId,
        instanceId,
        pid: process.pid,
        timestampMs: Date.now(),
        rssBytes: memoryUsage.rss,
        heapUsedBytes: memoryUsage.heapUsed,
        externalBytes: memoryUsage.external,
      });
      return;
    }

    if (message.type === 'shutdown') {
      void shutdown();
    }
  });

  try {
    await server.start();
    sendMessage({
      type: 'ready',
      instanceId,
      address: server.getAddress(),
      pid: process.pid,
    });
  } catch (error) {
    sendMessage({
      type: 'error',
      instanceId,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

void main();
