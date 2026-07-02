# Self-hosting the relay

Audience: operators.

Roomful works peer-to-peer in a single browser out of the box (the `broadcast` and `webrtc`
transports). To sync **across devices and networks**, point clients at a **relay** you run. This
guide gets a production-shaped relay running in a few minutes with Docker, or directly with the CLI.

## Quick start (Docker Compose)

From the repository root:

```bash
cp .env.example .env         # optional — an empty .env runs a working relay
docker compose up            # builds the image and starts the relay on :8787
```

Check it is healthy:

```bash
curl http://localhost:8787/health
# {"status":"ok"}
```

Point a client at it:

```ts
import { createRoom } from '@roomful/core';

const room = createRoom('my-room', {
  transport: 'websocket',
  relayUrl: 'ws://localhost:8787',
  presence: { name: 'Alice', color: '#5cc7ab' },
});
await room.connect();
```

## Configuration

`docker compose` reads `.env` automatically. Copy [`.env.example`](../../.env.example) and
uncomment what you need — every value has a safe default, and **leaving a value commented keeps it
unset** (an empty `FOO=` is not the same as unset and may be rejected).

| Variable                           | Default | Purpose                                                                  |
| ---------------------------------- | ------- | ------------------------------------------------------------------------ |
| `PORT`                             | `8787`  | Port the relay listens on (host and container).                          |
| `MAX_CONNECTIONS`                  | —       | Cap on concurrent WebSocket connections across all rooms.                |
| `ROOMFUL_MAX_ROOM_SIZE`            | —       | Hard per-room peer cap, on top of any client-requested `maxPeers`.       |
| `ROOMFUL_MAX_ROOMS`                | —       | Maximum distinct rooms this instance will host (`ROOM_LIMIT` beyond it). |
| `ROOMFUL_MESSAGE_RATE_LIMIT`       | —       | Max messages per peer per interval (`RATE_LIMITED` beyond it).           |
| `ROOMFUL_MESSAGE_RATE_INTERVAL_MS` | —       | Rate-limit window in ms. Set together with the limit above.              |
| `ROOMFUL_CORS_ORIGIN`              | any     | Allowed browser origin for CORS and WS upgrades (`*` allows any).        |
| `ROOMFUL_AUTH_SECRET`              | —       | HS256 JWT secret; when set, peers must present a valid token.            |
| `ROOMFUL_REDIS_URL`                | —       | Redis URL for multi-instance coordination (experimental).                |

The caps and rate limit are **off by default**. For a public deployment, set at least
`MAX_CONNECTIONS`, `ROOMFUL_MAX_ROOMS`, and a message rate limit so a single client cannot exhaust
the instance.

## Multiple instances (experimental)

To run more than one relay instance behind a load balancer, coordinate rooms through Redis. Set
`ROOMFUL_REDIS_URL=redis://redis:6379/0` in `.env` and start the bundled Redis with its profile:

```bash
docker compose --profile redis up
```

Redis coordination is experimental; its failure semantics may change.

## Production

[`docker-compose.prod.yml`](../../docker-compose.prod.yml) runs the published image
(`erayatesdev/roomful:latest`) instead of building locally:

```bash
docker compose -f docker-compose.prod.yml up -d
```

For a public deployment:

- Terminate TLS at a reverse proxy (Caddy, nginx, or your platform's load balancer) and forward to
  the relay; clients then use `wss://`.
- Set `ROOMFUL_CORS_ORIGIN` to your app's origin.
- Set `ROOMFUL_AUTH_SECRET` and issue short-lived JWTs to your users so only authorized peers can
  join.
- The image runs as a non-root user and exposes a `/health` endpoint for your platform's checks.

## Without Docker

The relay ships as a CLI on npm:

```bash
npx @roomful/relay --port 8787 --max-rooms 1000 --message-rate-limit 240 --message-rate-interval 60000
```

Run `npx @roomful/relay --help` for every flag; each also has a `ROOMFUL_*` environment variable
(see the table above).
