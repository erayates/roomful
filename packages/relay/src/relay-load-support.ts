export type RelayLoadScenarioName = 'steady-100' | 'scale-500-redis' | 'soak-500-redis';

export interface RelayLoadScenarioDefinition {
  readonly name: RelayLoadScenarioName;
  readonly title: string;
  readonly description: string;
  readonly duration: string;
  readonly vus: number;
  readonly roomCount: number;
  readonly relayInstances: number;
  readonly messageIntervalMs: number;
  readonly warmupMs: number;
  readonly payloadBytes: number;
  readonly requiresRedis: boolean;
  readonly latencyThresholdMs?: number;
}

export interface RelayLoadRuntimeOverrides {
  readonly duration?: string;
  readonly messageIntervalMs?: number;
  readonly payloadBytes?: number;
  readonly roomCount?: number;
  readonly vus?: number;
  readonly warmupMs?: number;
}

export type RelayLoadRuntimeConfig = RelayLoadScenarioDefinition;

export interface RelayMemorySample {
  readonly externalBytes: number;
  readonly heapUsedBytes: number;
  readonly instanceId: string;
  readonly rssBytes: number;
  readonly timestampMs: number;
}

export interface RelayMemoryInstanceSummary {
  readonly finalHeapUsedBytes: number;
  readonly finalRssBytes: number;
  readonly heapUsedDeltaBytes: number;
  readonly initialHeapUsedBytes: number;
  readonly initialRssBytes: number;
  readonly instanceId: string;
  readonly peakRssBytes: number;
  readonly rssDeltaBytes: number;
  readonly sampleCount: number;
  readonly stable: boolean;
}

export interface RelayMemorySummary {
  readonly growthLimitBytes: number;
  readonly instances: readonly RelayMemoryInstanceSummary[];
  readonly stable: boolean;
}

const RELAY_LOAD_SCENARIOS: readonly RelayLoadScenarioDefinition[] = Object.freeze([
  {
    name: 'steady-100',
    title: '100 peers in one room',
    description: 'Single relay steady-state latency baseline.',
    duration: '135s',
    vus: 100,
    roomCount: 1,
    relayInstances: 1,
    messageIntervalMs: 1_000,
    warmupMs: 15_000,
    payloadBytes: 256,
    requiresRedis: false,
    latencyThresholdMs: 50,
  },
  {
    name: 'scale-500-redis',
    title: '500 peers across 50 rooms',
    description: 'Five-minute Redis-backed cluster stability run across three relay instances.',
    duration: '320s',
    vus: 500,
    roomCount: 50,
    relayInstances: 3,
    messageIntervalMs: 1_000,
    warmupMs: 20_000,
    payloadBytes: 256,
    requiresRedis: true,
  },
  {
    name: 'soak-500-redis',
    title: '30-minute Redis soak',
    description:
      'Thirty-minute Redis-backed soak with memory sampling across three relay instances.',
    duration: '1830s',
    vus: 500,
    roomCount: 50,
    relayInstances: 3,
    messageIntervalMs: 1_500,
    warmupMs: 30_000,
    payloadBytes: 256,
    requiresRedis: true,
  },
]);

const K6_DURATION_PATTERN = /^\d+(ms|s|m|h)$/;
const DEFAULT_MEMORY_GROWTH_LIMIT_MB = 64;

function readPositiveInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`Invalid ${name} value "${value}".`);
  }

  return value;
}

function readDuration(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!K6_DURATION_PATTERN.test(value)) {
    throw new TypeError(`Invalid duration value "${value}".`);
  }

  return value;
}

export function listRelayLoadScenarios(): readonly RelayLoadScenarioDefinition[] {
  return RELAY_LOAD_SCENARIOS;
}

export function resolveRelayLoadScenario(name: string): RelayLoadScenarioDefinition {
  const scenario = RELAY_LOAD_SCENARIOS.find((candidate) => candidate.name === name);
  if (!scenario) {
    const supported = RELAY_LOAD_SCENARIOS.map((candidate) => candidate.name).join(', ');
    throw new TypeError(
      `Unsupported relay load scenario "${name}". Supported scenarios: ${supported}.`,
    );
  }

  return scenario;
}

export function createRelayLoadRuntimeConfig(
  scenario: RelayLoadScenarioDefinition,
  overrides: RelayLoadRuntimeOverrides = {},
): RelayLoadRuntimeConfig {
  const duration = readDuration(overrides.duration);
  const vus = readPositiveInteger(overrides.vus, 'vus');
  const roomCount = readPositiveInteger(overrides.roomCount, 'roomCount');
  const messageIntervalMs = readPositiveInteger(overrides.messageIntervalMs, 'messageIntervalMs');
  const warmupMs = readPositiveInteger(overrides.warmupMs, 'warmupMs');
  const payloadBytes = readPositiveInteger(overrides.payloadBytes, 'payloadBytes');

  return {
    ...scenario,
    ...(duration ? { duration } : {}),
    ...(vus ? { vus } : {}),
    ...(roomCount ? { roomCount } : {}),
    ...(messageIntervalMs ? { messageIntervalMs } : {}),
    ...(warmupMs ? { warmupMs } : {}),
    ...(payloadBytes ? { payloadBytes } : {}),
  };
}

export function createRelayLoadEnvironment(
  config: RelayLoadRuntimeConfig,
  relayUrls: readonly string[],
  resultsDir: string,
): Record<string, string> {
  if (relayUrls.length < config.relayInstances) {
    throw new TypeError(
      `Scenario "${config.name}" requires ${config.relayInstances} relay URLs, received ${relayUrls.length}.`,
    );
  }

  return {
    RELAY_DURATION: config.duration,
    RELAY_LATENCY_THRESHOLD_MS: String(config.latencyThresholdMs ?? 0),
    RELAY_MESSAGE_INTERVAL_MS: String(config.messageIntervalMs),
    RELAY_PAYLOAD_BYTES: String(config.payloadBytes),
    RELAY_RESULTS_DIR: resultsDir,
    RELAY_ROOM_COUNT: String(config.roomCount),
    RELAY_SCENARIO: config.name,
    RELAY_URLS: relayUrls.join(','),
    RELAY_VUS: String(config.vus),
    RELAY_WARMUP_MS: String(config.warmupMs),
  };
}

export function summarizeRelayMemorySamples(
  samples: readonly RelayMemorySample[],
  growthLimitMb = DEFAULT_MEMORY_GROWTH_LIMIT_MB,
): RelayMemorySummary {
  const growthLimit =
    readPositiveInteger(growthLimitMb, 'growthLimitMb') ?? DEFAULT_MEMORY_GROWTH_LIMIT_MB;
  const groupedSamples = new Map<string, RelayMemorySample[]>();

  for (const sample of samples) {
    const instanceSamples = groupedSamples.get(sample.instanceId) ?? [];
    instanceSamples.push(sample);
    groupedSamples.set(sample.instanceId, instanceSamples);
  }

  const growthLimitBytes = growthLimit * 1_024 * 1_024;
  const instances = Array.from(groupedSamples.entries())
    .map(([instanceId, instanceSamples]) => {
      const orderedSamples = [...instanceSamples].sort((left, right) => {
        return left.timestampMs - right.timestampMs;
      });
      const first = orderedSamples[0];
      const last = orderedSamples[orderedSamples.length - 1];
      if (!first || !last) {
        throw new TypeError(`Cannot summarize empty memory sample set for ${instanceId}.`);
      }

      const peakRssBytes = orderedSamples.reduce((peak, sample) => {
        return Math.max(peak, sample.rssBytes);
      }, first.rssBytes);
      const rssDeltaBytes = last.rssBytes - first.rssBytes;
      const heapUsedDeltaBytes = last.heapUsedBytes - first.heapUsedBytes;

      return {
        instanceId,
        sampleCount: orderedSamples.length,
        initialRssBytes: first.rssBytes,
        finalRssBytes: last.rssBytes,
        peakRssBytes,
        rssDeltaBytes,
        initialHeapUsedBytes: first.heapUsedBytes,
        finalHeapUsedBytes: last.heapUsedBytes,
        heapUsedDeltaBytes,
        stable: rssDeltaBytes <= growthLimitBytes,
      };
    })
    .sort((left, right) => {
      return left.instanceId.localeCompare(right.instanceId);
    });

  return {
    growthLimitBytes,
    instances,
    stable: instances.every((instance) => instance.stable),
  };
}
