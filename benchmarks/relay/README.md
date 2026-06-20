# Relay Load Tests

This suite runs reproducible relay load tests with `k6` and writes artifacts into `benchmarks/results/`.

## Prerequisites

- `k6` installed and available on `PATH`, or pass `--k6-bin`
- `pnpm --filter @cahoots/relay build`
- Redis available for Redis-backed scenarios

If `k6` is not on `PATH`, set an explicit binary path for local validation:

```bash
K6_BIN=/absolute/path/to/k6 pnpm --filter @cahoots/relay benchmark:load:steady
```

## Scenarios

- `steady-100`: 100 concurrent peers in one room on a single relay, with a `<50ms` median message-latency target
- `scale-500-redis`: 500 concurrent peers across 50 rooms on 3 relay instances for 5 minutes
- `soak-500-redis`: 500 concurrent peers across 50 rooms on 3 relay instances for 30 minutes, with memory sampling

The scenario durations include a short warmup period before broadcast traffic begins. The default presets leave a full 2-minute, 5-minute, or 30-minute measurement window after warmup.

## Commands

```bash
pnpm --filter @cahoots/relay benchmark:load:steady
pnpm --filter @cahoots/relay benchmark:load:scale -- --redis-url redis://127.0.0.1:6379/0
pnpm --filter @cahoots/relay benchmark:load:soak -- --redis-url redis://127.0.0.1:6379/0
```

Each run starts the required relay instances automatically, captures per-process RSS and heap samples every 10 seconds, runs the `k6` scenario, and writes:

- `run.json`: scenario metadata and relay addresses
- `k6-summary.json`: raw `k6` metrics export
- `relay-memory.ndjson`: raw relay memory samples
- `memory-summary.json`: per-instance memory growth summary
- `report.md`: acceptance-oriented run report

## Finding Breaking Points

Sweep concurrency upward from the 500-peer baseline until either `k6` thresholds fail or the generated `report.md` shows non-zero error rates:

```bash
pnpm --filter @cahoots/relay benchmark:load:scale -- --redis-url redis://127.0.0.1:6379/0 --vus 600
pnpm --filter @cahoots/relay benchmark:load:scale -- --redis-url redis://127.0.0.1:6379/0 --vus 700
pnpm --filter @cahoots/relay benchmark:load:scale -- --redis-url redis://127.0.0.1:6379/0 --vus 800
```

Adjust `--rooms`, `--message-interval-ms`, `--payload-bytes`, or `--duration` to probe different operating envelopes while keeping the same relay harness.
