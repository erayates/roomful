# Live Dashboard Example

A compact operations dashboard that shares counters through FlockJS state and sends alert-style
messages through the event engine.

## Run

```bash
pnpm --filter @flockjs/example-live-dashboard dev
```

Open two tabs with the same room ID, update a metric in one tab, and watch the other tab update.

## What It Shows

- Shared LWW state for dashboard metrics.
- Broadcast events for transient alerts.
- Presence list for active dashboard viewers.
- A practical pattern for dashboards, admin panels, and collaborative monitoring screens.
