# Live Dashboard Example

A compact operations dashboard that shares counters through Roomful state, sends alert-style messages
through the event engine, and keeps a durable **activity feed** of every change — a starter for
collaborative admin panels and monitoring screens.

## Run

```bash
pnpm --filter @roomful/example-live-dashboard dev
```

Open two tabs with the same room ID, update a metric in one tab, and watch the other tab update. The
activity feed is written to `localStorage`, so it also survives a reload.

## What It Shows

- Shared LWW state for dashboard metrics.
- Broadcast events for transient alerts.
- Presence list for active dashboard viewers.
- A shared, **durable activity feed** (`room.useActivity` +
  `createLocalStorageActivityStorage`): every metric change and alert is recorded, broadcast to all
  operators, and restored on reload — an audit trail with zero backend.
- A practical pattern for dashboards, admin panels, and collaborative monitoring screens.
