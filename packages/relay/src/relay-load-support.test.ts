import { describe, expect, it } from 'vitest';

import {
  createRelayLoadEnvironment,
  createRelayLoadRuntimeConfig,
  listRelayLoadScenarios,
  resolveRelayLoadScenario,
  summarizeRelayMemorySamples,
} from './relay-load-support';

describe('relay load support', () => {
  it('lists and resolves supported scenarios', () => {
    const scenarios = listRelayLoadScenarios();

    expect(scenarios.map((scenario) => scenario.name)).toEqual([
      'steady-100',
      'scale-500-redis',
      'soak-500-redis',
    ]);
    expect(resolveRelayLoadScenario('steady-100')).toMatchObject({
      relayInstances: 1,
      roomCount: 1,
      vus: 100,
    });
    expect(() => resolveRelayLoadScenario('missing')).toThrowError(/supported scenarios/i);
  });

  it('applies runtime overrides and validates them', () => {
    const config = createRelayLoadRuntimeConfig(resolveRelayLoadScenario('scale-500-redis'), {
      duration: '7m',
      messageIntervalMs: 750,
      roomCount: 25,
      vus: 250,
      warmupMs: 10_000,
    });

    expect(config).toMatchObject({
      duration: '7m',
      messageIntervalMs: 750,
      roomCount: 25,
      vus: 250,
      warmupMs: 10_000,
    });
    expect(() =>
      createRelayLoadRuntimeConfig(resolveRelayLoadScenario('steady-100'), {
        duration: 'soon',
      }),
    ).toThrowError(/invalid duration/i);
    expect(() =>
      createRelayLoadRuntimeConfig(resolveRelayLoadScenario('steady-100'), {
        vus: 0,
      }),
    ).toThrowError(/invalid vus/i);
  });

  it('creates k6 environment variables and enforces required relay urls', () => {
    const config = createRelayLoadRuntimeConfig(resolveRelayLoadScenario('scale-500-redis'));

    expect(() =>
      createRelayLoadEnvironment(config, ['ws://127.0.0.1:8787'], 'benchmarks/results/run-1'),
    ).toThrowError(/requires 3 relay urls/i);

    expect(
      createRelayLoadEnvironment(
        config,
        ['ws://127.0.0.1:8787', 'ws://127.0.0.1:8788', 'ws://127.0.0.1:8789'],
        'benchmarks/results/run-1',
      ),
    ).toEqual({
      RELAY_DURATION: '320s',
      RELAY_LATENCY_THRESHOLD_MS: '0',
      RELAY_MESSAGE_INTERVAL_MS: '1000',
      RELAY_PAYLOAD_BYTES: '256',
      RELAY_RESULTS_DIR: 'benchmarks/results/run-1',
      RELAY_ROOM_COUNT: '50',
      RELAY_SCENARIO: 'scale-500-redis',
      RELAY_URLS: 'ws://127.0.0.1:8787,ws://127.0.0.1:8788,ws://127.0.0.1:8789',
      RELAY_VUS: '500',
      RELAY_WARMUP_MS: '20000',
    });
  });

  it('summarizes per-instance memory growth against a configurable stability budget', () => {
    const summary = summarizeRelayMemorySamples(
      [
        {
          instanceId: 'relay-b',
          timestampMs: 2_000,
          rssBytes: 100 * 1_024 * 1_024,
          heapUsedBytes: 20 * 1_024 * 1_024,
          externalBytes: 2 * 1_024 * 1_024,
        },
        {
          instanceId: 'relay-a',
          timestampMs: 1_000,
          rssBytes: 80 * 1_024 * 1_024,
          heapUsedBytes: 15 * 1_024 * 1_024,
          externalBytes: 1 * 1_024 * 1_024,
        },
        {
          instanceId: 'relay-a',
          timestampMs: 3_000,
          rssBytes: 100 * 1_024 * 1_024,
          heapUsedBytes: 19 * 1_024 * 1_024,
          externalBytes: 1 * 1_024 * 1_024,
        },
        {
          instanceId: 'relay-b',
          timestampMs: 4_000,
          rssBytes: 180 * 1_024 * 1_024,
          heapUsedBytes: 35 * 1_024 * 1_024,
          externalBytes: 2 * 1_024 * 1_024,
        },
      ],
      32,
    );

    expect(summary).toMatchObject({
      growthLimitBytes: 32 * 1_024 * 1_024,
      stable: false,
      instances: [
        {
          instanceId: 'relay-a',
          sampleCount: 2,
          rssDeltaBytes: 20 * 1_024 * 1_024,
          stable: true,
        },
        {
          instanceId: 'relay-b',
          sampleCount: 2,
          rssDeltaBytes: 80 * 1_024 * 1_024,
          stable: false,
        },
      ],
    });
  });
});
