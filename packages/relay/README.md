# @roomful/relay

Self-hosted relay server for Roomful WebRTC signaling and WebSocket room transport.

> **Public beta** — install with the `@beta` tag; the API is stable but may still change before 1.0.

## Install

Library usage:

```bash
npm install @roomful/relay@beta
```

Global CLI usage:

```bash
npm install -g @roomful/relay@beta
```

## Run

CLI flags:

```bash
roomful-relay --port 8080
roomful-relay --host 0.0.0.0 --port 8787 --max-connections 1000
roomful-relay --max-room-size 50
roomful-relay --cors-origin https://app.example.com --auth-secret your-secret
roomful-relay --redis-url redis://127.0.0.1:6379/0   # experimental
roomful-relay --version
```

All flags take precedence over their matching environment variable.

| Flag                         | Environment variable    | Description                                              |
| ---------------------------- | ----------------------- | -------------------------------------------------------- |
| `--port <number>`            | `PORT` / `ROOMFUL_PORT` | TCP port to listen on (default: `8787`)                  |
| `--host <address>`           | `HOST`                  | Interface to bind (default: `127.0.0.1`)                 |
| `--max-connections <number>` | `MAX_CONNECTIONS`       | Concurrent WebSocket connection cap                      |
| `--max-room-size <number>`   | `ROOMFUL_MAX_ROOM_SIZE` | Hard per-room peer cap                                   |
| `--cors-origin <origin>`     | `ROOMFUL_CORS_ORIGIN`   | Allowed browser origin (use `*` to allow any)            |
| `--auth-secret <secret>`     | `ROOMFUL_AUTH_SECRET`   | HS256 JWT secret enabling built-in authorization         |
| `--redis-url <url>`          | `ROOMFUL_REDIS_URL`     | Redis URL for multi-instance coordination (experimental) |

Environment variables:

| Variable                   | Default     | Description                                                                                                                                |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT` (or `ROOMFUL_PORT`) | `8787`      | TCP port to listen on (`ROOMFUL_PORT` takes precedence over `PORT`)                                                                        |
| `HOST`                     | `127.0.0.1` | Interface to bind the relay server to                                                                                                      |
| `MAX_CONNECTIONS`          | unset       | Optional concurrent WebSocket connection cap                                                                                               |
| `ROOMFUL_MAX_ROOM_SIZE`    | unset       | Hard per-room peer cap                                                                                                                     |
| `ROOMFUL_CORS_ORIGIN`      | unset       | Allowed browser origin; adds CORS headers on HTTP responses and rejects WebSocket upgrades from other origins. Use `*` to allow any origin |
| `ROOMFUL_AUTH_SECRET`      | unset       | Enables built-in HS256 JWT authorization; peers must present a valid token signed with this secret                                         |
| `ROOMFUL_REDIS_URL`        | unset       | _Experimental._ Optional Redis URL for multi-instance coordination; coordination semantics may change before 1.0                           |

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## Docker

Published image (`erayatesdev/roomful` — versions are pinned; prereleases get no `:latest` tag until the stable `1.0.0`):

```bash
docker pull erayatesdev/roomful:1.0.0-beta.7
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 erayatesdev/roomful:1.0.0-beta.7
```

Local and production Compose examples live at the repository root in `docker-compose.yml` and
`docker-compose.prod.yml`.

## Powering the live demo

`apps/demo` (demo.roomful.dev) ships on **BroadcastChannel** by default — zero backend, multiplayer
across tabs/windows in one browser. To upgrade it to **cross-device** multiplayer, deploy this relay
and point the demo at it (no demo code change required):

1. Deploy the relay (the `erayatesdev/roomful` image, the Compose files, or the `roomful-relay`
   CLI on Fly/Railway/Render). Set `HOST=0.0.0.0` and `ROOMFUL_CORS_ORIGIN=https://demo.roomful.dev`.
2. On the demo's Vercel project, set `VITE_ROOMFUL_RELAY_URL=wss://your-relay-host` and redeploy.

The demo auto-switches to the WebSocket transport whenever a relay URL is present. You can also test
ad-hoc against any relay with `?relay=wss://your-relay-host` appended to a demo URL.

A single relay instance needs no Redis, so the demo above runs Redis-free.

## Scaling across instances (experimental)

Running multiple relay instances behind a load balancer requires Redis so peers landing on
different instances can find each other. Point each instance at the same Redis with
`ROOMFUL_REDIS_URL` (or `--redis-url`).

> **Experimental.** Multi-instance Redis coordination is experimental and its semantics — for
> example, rejecting joins while Redis is unavailable — may change before the stable 1.0.
