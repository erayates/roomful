# Benchmarks

Relay-specific performance utilities live with the package code so they can reuse the relay test/runtime helpers without affecting the default package test run.

## Redis Latency Benchmark

```bash
FLOCK_REDIS_URL=redis://127.0.0.1:6379/0 pnpm --filter @flockjs/relay benchmark:redis
```

The benchmark compares:

- single-instance relay event delivery
- Redis-backed cross-instance relay event delivery

Use the reported benchmark output to validate the `<5ms` additional-latency target for Redis mode in your local environment.

## Relay Load Tests

The larger relay load harness lives under `benchmarks/relay/` and is designed around the Sprint 4 relay acceptance criteria:

- 100 concurrent peers in one room with `<50ms` median latency
- 500 concurrent peers across 50 rooms for 5 minutes
- 30-minute soak test with relay-process memory sampling
- Redis-backed runs across 3 relay instances

Entrypoints:

```bash
pnpm --filter @flockjs/relay benchmark:load:steady
pnpm --filter @flockjs/relay benchmark:load:scale -- --redis-url redis://127.0.0.1:6379/0
pnpm --filter @flockjs/relay benchmark:load:soak -- --redis-url redis://127.0.0.1:6379/0
```

Detailed setup, overrides, and output files are documented in [`benchmarks/relay/README.md`](relay/README.md).
