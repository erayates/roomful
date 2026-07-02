---
'@roomful/relay': minor
---

Add production hardening controls to the relay server (EP-13): per-peer message rate limiting via
`messageRateLimit` (a token bucket of `limit` messages refilling over `intervalMs`) and a
`maxRooms` cap on the number of distinct rooms a relay instance will host. Excess messages are
rejected with a `RATE_LIMITED` error and over-cap joins with `ROOM_LIMIT`, instead of being
processed. Both are configurable from the `roomful-relay` CLI (`--max-rooms`,
`--message-rate-limit`, `--message-rate-interval`) and the `ROOMFUL_MAX_ROOMS` /
`ROOMFUL_MESSAGE_RATE_LIMIT` / `ROOMFUL_MESSAGE_RATE_INTERVAL_MS` environment variables. Both are
off by default, so existing behaviour is unchanged.
