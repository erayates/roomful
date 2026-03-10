import exec from 'k6/execution';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import ws from 'k6/ws';

const scenarioName = __ENV.RELAY_SCENARIO || 'steady-100';
const relayUrls = (__ENV.RELAY_URLS || '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const vus = Number(__ENV.RELAY_VUS || '100');
const roomCount = Number(__ENV.RELAY_ROOM_COUNT || '1');
const duration = __ENV.RELAY_DURATION || '2m';
const warmupMs = Number(__ENV.RELAY_WARMUP_MS || '15000');
const messageIntervalMs = Number(__ENV.RELAY_MESSAGE_INTERVAL_MS || '1000');
const payloadBytes = Number(__ENV.RELAY_PAYLOAD_BYTES || '256');
const latencyThresholdMs = Number(__ENV.RELAY_LATENCY_THRESHOLD_MS || '0');

const joinLatency = new Trend('relay_join_latency_ms');
const messageLatency = new Trend('relay_message_latency_ms');
const joinErrors = new Rate('relay_join_errors');
const connectErrors = new Rate('relay_connect_errors');
const deliveryErrors = new Rate('relay_delivery_errors');
const messagesSent = new Counter('relay_messages_sent');
const messagesReceived = new Counter('relay_messages_received');

function parseDurationToMilliseconds(value) {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid RELAY_DURATION value "${value}".`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'ms') {
    return amount;
  }

  if (unit === 's') {
    return amount * 1000;
  }

  if (unit === 'm') {
    return amount * 60 * 1000;
  }

  return amount * 60 * 60 * 1000;
}

function parseJson(value) {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildPayload(length) {
  if (length <= 0) {
    return '';
  }

  return 'x'.repeat(length);
}

function buildTransportMessage(roomId, peerId, payload, sequence) {
  return JSON.stringify({
    type: 'transport',
    message: {
      source: 'flockjs',
      protocolVersion: 2,
      codec: 'json',
      roomId,
      fromPeerId: peerId,
      timestamp: Date.now(),
      type: 'event',
      payload: {
        name: 'load-probe',
        payload: {
          body: payload,
          sentAtMs: Date.now(),
          sequence,
        },
      },
    },
  });
}

function readProbeLatency(message, peerId) {
  if (message === null || typeof message !== 'object' || message.type !== 'transport') {
    return null;
  }

  const transportMessage = message.message;
  if (transportMessage === null || typeof transportMessage !== 'object') {
    return null;
  }

  const signal = transportMessage.signal;
  if (signal === null || typeof signal !== 'object' || signal.type !== 'event') {
    return null;
  }

  if (signal.fromPeerId === peerId) {
    return null;
  }

  const signalPayload = signal.payload;
  if (signalPayload === null || typeof signalPayload !== 'object') {
    return null;
  }

  const event = signalPayload.event;
  if (event === null || typeof event !== 'object' || event.name !== 'load-probe') {
    return null;
  }

  const eventPayload = event.payload;
  if (
    eventPayload === null ||
    typeof eventPayload !== 'object' ||
    typeof eventPayload.sentAtMs !== 'number'
  ) {
    return null;
  }

  return Date.now() - eventPayload.sentAtMs;
}

function createThresholds() {
  const thresholds = {
    relay_connect_errors: ['rate<0.01'],
    relay_delivery_errors: ['rate<0.01'],
    relay_join_errors: ['rate<0.01'],
  };

  if (latencyThresholdMs > 0) {
    thresholds.relay_message_latency_ms = [`med<${latencyThresholdMs}`];
  }

  return thresholds;
}

export const options = {
  scenarios: {
    relay: {
      executor: 'constant-vus',
      gracefulStop: '15s',
      vus,
      duration,
    },
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
  thresholds: createThresholds(),
};

export default function () {
  if (relayUrls.length === 0) {
    throw new Error('No RELAY_URLS were provided.');
  }

  const vuId = exec.vu.idInTest;
  const relayIndex = (vuId - 1) % relayUrls.length;
  const roomIndex = (vuId - 1) % roomCount;
  const relayUrl = relayUrls[relayIndex];
  const roomId = `room-${roomIndex + 1}`;
  const peerId = `${scenarioName}-peer-${vuId}`;
  const tags = {
    relay: `relay-${relayIndex + 1}`,
    scenario: scenarioName,
  };
  const transportPayload = buildPayload(payloadBytes);
  const joinStartedAtMs = Date.now();
  const sessionDurationMs = parseDurationToMilliseconds(duration);

  const response = ws.connect(relayUrl, { tags }, function (socket) {
    let joined = false;
    let sequence = 0;

    socket.on('open', function () {
      socket.send(
        JSON.stringify({
          type: 'join',
          roomId,
          peerId,
        }),
      );

      socket.setTimeout(function () {
        if (!joined) {
          joinErrors.add(1, tags);
          socket.close();
        }
      }, 10_000);
    });

    socket.on('message', function (rawData) {
      const message = parseJson(rawData);
      if (message === null) {
        deliveryErrors.add(1, tags);
        return;
      }

      if (message.type === 'joined') {
        joined = true;
        joinLatency.add(Date.now() - joinStartedAtMs, tags);
        const sendOffsetMs = ((vuId - 1) % 25) * 10;

        socket.setTimeout(function () {
          socket.setInterval(function () {
            socket.send(buildTransportMessage(roomId, peerId, transportPayload, sequence));
            messagesSent.add(1, tags);
            sequence += 1;
          }, messageIntervalMs);
        }, warmupMs + sendOffsetMs);
        return;
      }

      if (message.type === 'error') {
        if (!joined) {
          joinErrors.add(1, tags);
        } else {
          deliveryErrors.add(1, tags);
        }
        socket.close();
        return;
      }

      const latency = readProbeLatency(message, peerId);
      if (latency === null) {
        return;
      }

      messageLatency.add(latency, tags);
      messagesReceived.add(1, tags);
    });

    socket.on('error', function () {
      connectErrors.add(1, tags);
    });

    socket.setTimeout(
      function () {
        socket.close();
      },
      Math.max(sessionDurationMs - 1_000, 1_000),
    );
  });

  check(response, {
    'relay websocket upgraded': (result) => result && result.status === 101,
  });
}
