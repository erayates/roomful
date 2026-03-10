# Benchmarks

Relay-specific performance utilities live with the package code so they can reuse the relay test/runtime helpers without affecting the default package test run.

Current relay benchmark entrypoint:

```bash
FLOCK_REDIS_URL=redis://127.0.0.1:6379/0 pnpm --filter @flockjs/relay benchmark:redis
```

The benchmark compares:

- single-instance relay event delivery
- Redis-backed cross-instance relay event delivery

Use the reported benchmark output to validate the `<5ms` additional-latency target for Redis mode in your local environment.
