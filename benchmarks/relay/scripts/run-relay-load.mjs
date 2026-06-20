import { createWriteStream } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fork, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  createRelayLoadEnvironment,
  createRelayLoadRuntimeConfig,
  resolveRelayLoadScenario,
  summarizeRelayMemorySamples,
} from '../../../packages/relay/dist/relay-load-support.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const k6ScriptPath = path.join(repoRoot, 'benchmarks', 'relay', 'k6', 'relay-load.js');
const managedRelayPath = path.join(repoRoot, 'benchmarks', 'relay', 'scripts', 'managed-relay.mjs');

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function readPositiveInteger(value, name) {
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new TypeError(`Invalid ${name} value "${value}".`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TypeError(`Invalid ${name} value "${value}".`);
  }

  return parsed;
}

function printUsage() {
  process.stdout.write(`Usage: node benchmarks/relay/scripts/run-relay-load.mjs <scenario> [options]

Scenarios:
  steady-100
  scale-500-redis
  soak-500-redis

Options:
  --redis-url <url>
  --duration <k6-duration>
  --vus <count>
  --rooms <count>
  --message-interval-ms <count>
  --warmup-ms <count>
  --payload-bytes <count>
  --host <host>
  --k6-bin <path>
  --memory-growth-limit-mb <count>
  --results-dir <path>
`);
}

function parseArguments(argv) {
  const values = {
    duration: undefined,
    host: '127.0.0.1',
    k6Bin: process.env.K6_BIN ?? 'k6',
    memoryGrowthLimitMb: undefined,
    messageIntervalMs: undefined,
    payloadBytes: undefined,
    redisUrl: process.env.FLOCK_REDIS_URL,
    resultsDir: undefined,
    roomCount: undefined,
    scenarioName: 'steady-100',
    vus: undefined,
    warmupMs: undefined,
  };

  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      printUsage();
      process.exit(0);
    }

    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined) {
      throw new TypeError(`Missing value for ${argument}.`);
    }

    if (argument === '--redis-url') {
      values.redisUrl = next;
    } else if (argument === '--duration') {
      values.duration = next;
    } else if (argument === '--vus') {
      values.vus = readPositiveInteger(next, 'vus');
    } else if (argument === '--rooms') {
      values.roomCount = readPositiveInteger(next, 'rooms');
    } else if (argument === '--message-interval-ms') {
      values.messageIntervalMs = readPositiveInteger(next, 'messageIntervalMs');
    } else if (argument === '--warmup-ms') {
      values.warmupMs = readPositiveInteger(next, 'warmupMs');
    } else if (argument === '--payload-bytes') {
      values.payloadBytes = readPositiveInteger(next, 'payloadBytes');
    } else if (argument === '--host') {
      values.host = next;
    } else if (argument === '--k6-bin') {
      values.k6Bin = next;
    } else if (argument === '--memory-growth-limit-mb') {
      values.memoryGrowthLimitMb = readPositiveInteger(next, 'memoryGrowthLimitMb');
    } else if (argument === '--results-dir') {
      values.resultsDir = next;
    } else {
      throw new TypeError(`Unknown argument "${argument}".`);
    }

    index += 1;
  }

  if (positional.length > 0) {
    values.scenarioName = positional[0];
  }

  return values;
}

function assertK6Available(k6Bin) {
  const result = spawnSync(k6Bin, ['version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    const errorMessage = result.error instanceof Error ? result.error.message : '';
    const stderr = (result.stderr ?? '').trim();
    const detail = stderr || errorMessage;
    const hint =
      'Install k6 and make it available on PATH, or pass --k6-bin <path> / set K6_BIN to an executable k6 binary.';
    throw new Error(
      detail.length > 0
        ? `Unable to execute k6 via "${k6Bin}": ${detail}\n${hint}`
        : `Unable to execute k6 via "${k6Bin}".\n${hint}`,
    );
  }
}

function createRunId(scenarioName) {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${scenarioName}`;
}

function formatBytes(value) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function createRelayInstance(index, child) {
  return {
    child,
    index,
    instanceId: `relay-${index + 1}`,
    messageHandlers: new Map(),
  };
}

async function startRelayCluster(config, options, resultsDir) {
  const relayUrls = [];
  const instances = [];

  try {
    for (let index = 0; index < config.relayInstances; index += 1) {
      const child = fork(managedRelayPath, [], {
        cwd: repoRoot,
        env: {
          ...process.env,
          HOST: options.host,
          PORT: '0',
          RELAY_INSTANCE_ID: `relay-${index + 1}`,
          ...(config.requiresRedis && options.redisUrl
            ? { FLOCK_REDIS_URL: options.redisUrl }
            : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });

      const instance = createRelayInstance(index, child);
      const stdoutLog = createWriteStream(path.join(resultsDir, `relay-${index + 1}.stdout.log`));
      const stderrLog = createWriteStream(path.join(resultsDir, `relay-${index + 1}.stderr.log`));
      if (child.stdout) {
        child.stdout.pipe(stdoutLog);
      }
      if (child.stderr) {
        child.stderr.pipe(stderrLog);
      }

      const ready = new Promise((resolve, reject) => {
        const onMessage = (message) => {
          if (!isObject(message) || typeof message.type !== 'string') {
            return;
          }

          if (message.type === 'ready' && typeof message.address === 'string') {
            child.off('message', onMessage);
            child.off('exit', onExit);
            instance.address = message.address;
            instance.pid = message.pid;
            relayUrls.push(message.address);
            resolve(undefined);
            return;
          }

          if (message.type === 'error' && typeof message.message === 'string') {
            child.off('message', onMessage);
            child.off('exit', onExit);
            reject(new Error(message.message));
          }
        };

        const onExit = (code) => {
          child.off('message', onMessage);
          reject(
            new Error(`Relay instance ${index + 1} exited before readiness with code ${code}.`),
          );
        };

        child.on('message', onMessage);
        child.once('exit', onExit);
      });

      child.on('message', (message) => {
        if (
          !isObject(message) ||
          message.type !== 'snapshot' ||
          typeof message.requestId !== 'string'
        ) {
          return;
        }

        const handler = instance.messageHandlers.get(message.requestId);
        if (!handler) {
          return;
        }

        instance.messageHandlers.delete(message.requestId);
        handler.resolve(message);
      });

      instances.push(instance);
      await ready;
    }
  } catch (error) {
    await stopRelayCluster(instances).catch(() => undefined);
    throw error;
  }

  return { instances, relayUrls };
}

function requestSnapshot(instance) {
  return new Promise((resolve, reject) => {
    const requestId = `${instance.instanceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = setTimeout(() => {
      instance.messageHandlers.delete(requestId);
      reject(new Error(`Timed out waiting for snapshot from ${instance.instanceId}.`));
    }, 5_000);

    instance.messageHandlers.set(requestId, {
      resolve: (message) => {
        clearTimeout(timeout);
        resolve(message);
      },
    });
    if (!instance.child.connected) {
      clearTimeout(timeout);
      instance.messageHandlers.delete(requestId);
      reject(new Error(`Relay instance ${instance.instanceId} is not connected.`));
      return;
    }

    instance.child.send({
      type: 'snapshot',
      requestId,
    });
  });
}

async function stopRelayCluster(instances) {
  await Promise.all(
    instances.map((instance) => {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          instance.child.kill('SIGTERM');
          resolve(undefined);
        }, 5_000);

        instance.child.once('exit', () => {
          clearTimeout(timer);
          resolve(undefined);
        });
        if (!instance.child.connected) {
          clearTimeout(timer);
          resolve(undefined);
          return;
        }

        instance.child.send({
          type: 'shutdown',
        });
      });
    }),
  );
}

async function sampleClusterMemory(instances, samples, memoryLogPath) {
  const snapshotMessages = await Promise.all(
    instances.map((instance) => requestSnapshot(instance)),
  );
  const lines = [];

  for (const message of snapshotMessages) {
    const sample = {
      externalBytes: message.externalBytes,
      heapUsedBytes: message.heapUsedBytes,
      instanceId: message.instanceId,
      rssBytes: message.rssBytes,
      timestampMs: message.timestampMs,
    };
    samples.push(sample);
    lines.push(JSON.stringify(sample));
  }

  await appendFile(memoryLogPath, `${lines.join('\n')}\n`, 'utf8');
}

async function runK6(k6Bin, env, resultsDir) {
  const stdoutLog = createWriteStream(path.join(resultsDir, 'k6.stdout.log'));
  const stderrLog = createWriteStream(path.join(resultsDir, 'k6.stderr.log'));
  const summaryPath = path.join(resultsDir, 'k6-summary.json');

  return new Promise((resolve, reject) => {
    const k6 = spawn(k6Bin, ['run', '--summary-export', summaryPath, k6ScriptPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (k6.stdout) {
      k6.stdout.pipe(stdoutLog);
    }
    if (k6.stderr) {
      k6.stderr.pipe(stderrLog);
    }
    k6.once('error', reject);
    k6.once('exit', (code) => {
      resolve({
        code: code ?? 1,
        summaryPath,
      });
    });
  });
}

function readMetricValue(summary, metricName, propertyName) {
  if (!isObject(summary) || !isObject(summary.metrics) || !isObject(summary.metrics[metricName])) {
    return undefined;
  }

  const metric = summary.metrics[metricName];
  const values = isObject(metric.values) ? metric.values : metric;
  const normalizedPropertyName = propertyName === 'rate' ? 'value' : propertyName;

  if (typeof values[propertyName] === 'number') {
    return values[propertyName];
  }

  if (typeof values[normalizedPropertyName] === 'number') {
    return values[normalizedPropertyName];
  }

  return undefined;
}

function renderAcceptance(config, k6Summary, memorySummary) {
  const latencyMedian = readMetricValue(k6Summary, 'relay_message_latency_ms', 'med');
  const connectErrorRate = readMetricValue(k6Summary, 'relay_connect_errors', 'rate') ?? 0;
  const joinErrorRate = readMetricValue(k6Summary, 'relay_join_errors', 'rate') ?? 0;
  const deliveryErrorRate = readMetricValue(k6Summary, 'relay_delivery_errors', 'rate') ?? 0;

  const items = [
    {
      label: 'Relay connection error rate < 1%',
      passed: connectErrorRate < 0.01,
      detail: `${connectErrorRate.toFixed(4)} rate`,
    },
    {
      label: 'Relay join error rate < 1%',
      passed: joinErrorRate < 0.01,
      detail: `${joinErrorRate.toFixed(4)} rate`,
    },
    {
      label: 'Relay delivery error rate < 1%',
      passed: deliveryErrorRate < 0.01,
      detail: `${deliveryErrorRate.toFixed(4)} rate`,
    },
  ];

  if (config.name === 'steady-100') {
    items.push({
      label: '100 concurrent peers in one room: median latency < 50ms',
      passed:
        typeof latencyMedian === 'number' && latencyMedian < (config.latencyThresholdMs ?? 50),
      detail:
        typeof latencyMedian === 'number'
          ? `${latencyMedian.toFixed(2)}ms median`
          : 'No latency samples',
    });
  }

  if (config.name === 'scale-500-redis') {
    items.push({
      label: '500 concurrent peers across 50 rooms: stable for 5 minutes',
      passed: connectErrorRate === 0 && joinErrorRate === 0 && deliveryErrorRate === 0,
      detail: `connect=${connectErrorRate.toFixed(4)} join=${joinErrorRate.toFixed(4)} delivery=${deliveryErrorRate.toFixed(4)}`,
    });
    items.push({
      label: 'Redis adapter tested with 3 relay instances',
      passed: config.relayInstances === 3,
      detail: `${config.relayInstances} relay instances`,
    });
  }

  if (config.name === 'soak-500-redis') {
    items.push({
      label: 'Memory usage stable over 30-minute soak test',
      passed: memorySummary.stable,
      detail: memorySummary.instances
        .map((instance) => {
          return `${instance.instanceId}: ${formatBytes(instance.rssDeltaBytes)}`;
        })
        .join(', '),
    });
    items.push({
      label: 'Redis adapter tested with 3 relay instances',
      passed: config.relayInstances === 3,
      detail: `${config.relayInstances} relay instances`,
    });
  }

  return items;
}

function renderReport(runId, config, relayUrls, k6Summary, memorySummary, acceptance) {
  const latencyMedian = readMetricValue(k6Summary, 'relay_message_latency_ms', 'med');
  const latencyP95 = readMetricValue(k6Summary, 'relay_message_latency_ms', 'p(95)');
  const joins = readMetricValue(k6Summary, 'relay_join_latency_ms', 'med');
  const sent = readMetricValue(k6Summary, 'relay_messages_sent', 'count');
  const received = readMetricValue(k6Summary, 'relay_messages_received', 'count');

  const lines = [
    `# Relay Load Test Report`,
    '',
    `- Run ID: \`${runId}\``,
    `- Scenario: \`${config.name}\``,
    `- Description: ${config.description}`,
    `- Duration: \`${config.duration}\``,
    `- Relay URLs: ${relayUrls.map((value) => `\`${value}\``).join(', ')}`,
    `- Rooms: ${config.roomCount}`,
    `- Virtual users: ${config.vus}`,
    '',
    '## k6 Summary',
    '',
    `- Join median: ${typeof joins === 'number' ? `${joins.toFixed(2)}ms` : 'n/a'}`,
    `- Message median: ${typeof latencyMedian === 'number' ? `${latencyMedian.toFixed(2)}ms` : 'n/a'}`,
    `- Message p95: ${typeof latencyP95 === 'number' ? `${latencyP95.toFixed(2)}ms` : 'n/a'}`,
    `- Messages sent: ${typeof sent === 'number' ? sent : 'n/a'}`,
    `- Messages received: ${typeof received === 'number' ? received : 'n/a'}`,
    '',
    '## Memory Summary',
    '',
    ...memorySummary.instances.map((instance) => {
      return `- ${instance.instanceId}: rss ${formatBytes(instance.initialRssBytes)} -> ${formatBytes(instance.finalRssBytes)} (delta ${formatBytes(instance.rssDeltaBytes)}, peak ${formatBytes(instance.peakRssBytes)})`;
    }),
    '',
    '## Acceptance Criteria',
    '',
    ...acceptance.map((item) => {
      return `- [${item.passed ? 'x' : ' '}] ${item.label} (${item.detail})`;
    }),
  ];

  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const scenario = resolveRelayLoadScenario(args.scenarioName);
  const config = createRelayLoadRuntimeConfig(scenario, {
    duration: args.duration,
    messageIntervalMs: args.messageIntervalMs,
    payloadBytes: args.payloadBytes,
    roomCount: args.roomCount,
    vus: args.vus,
    warmupMs: args.warmupMs,
  });

  if (config.requiresRedis && (!args.redisUrl || args.redisUrl.length === 0)) {
    throw new TypeError(`Scenario "${config.name}" requires --redis-url or FLOCK_REDIS_URL.`);
  }

  assertK6Available(args.k6Bin);

  const runId = createRunId(config.name);
  const resultsDir = path.resolve(
    repoRoot,
    args.resultsDir ?? path.join('benchmarks', 'results', runId),
  );
  await mkdir(resultsDir, { recursive: true });

  const memoryLogPath = path.join(resultsDir, 'relay-memory.ndjson');
  const samples = [];
  const { instances, relayUrls } = await startRelayCluster(config, args, resultsDir);
  const env = createRelayLoadEnvironment(config, relayUrls, path.relative(repoRoot, resultsDir));
  const runMetadata = {
    config,
    redisUrl: config.requiresRedis ? args.redisUrl : null,
    relayUrls,
    runId,
  };

  await writeFile(path.join(resultsDir, 'run.json'), JSON.stringify(runMetadata, null, 2));

  let memoryTimer = null;
  try {
    await sampleClusterMemory(instances, samples, memoryLogPath);
    memoryTimer = setInterval(() => {
      void sampleClusterMemory(instances, samples, memoryLogPath).catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      });
    }, 10_000);

    const k6Result = await runK6(args.k6Bin, env, resultsDir);
    await sampleClusterMemory(instances, samples, memoryLogPath);

    const k6Summary = JSON.parse(await readFile(k6Result.summaryPath, 'utf8'));
    const memorySummary = summarizeRelayMemorySamples(samples, args.memoryGrowthLimitMb ?? 64);
    const acceptance = renderAcceptance(config, k6Summary, memorySummary);
    const report = renderReport(runId, config, relayUrls, k6Summary, memorySummary, acceptance);

    await writeFile(path.join(resultsDir, 'report.md'), report);
    await writeFile(
      path.join(resultsDir, 'memory-summary.json'),
      JSON.stringify(memorySummary, null, 2),
    );

    const failedAcceptance = acceptance.filter((item) => {
      return !item.passed;
    });
    if (failedAcceptance.length > 0) {
      throw new Error(
        `Relay load acceptance failed: ${failedAcceptance
          .map((item) => `${item.label} (${item.detail})`)
          .join('; ')}. See ${path.join(resultsDir, 'report.md')}.`,
      );
    }

    if (k6Result.code !== 0) {
      throw new Error(
        `k6 exited with code ${k6Result.code}. See ${path.join(resultsDir, 'report.md')}.`,
      );
    }
  } finally {
    if (memoryTimer !== null) {
      clearInterval(memoryTimer);
    }

    await stopRelayCluster(instances).catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
