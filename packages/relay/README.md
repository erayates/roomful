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
roomful-relay --redis-url redis://127.0.0.1:6379/0
roomful-relay --version
```

Environment variables:

| Variable                   | Default     | Description                                                                                                                                |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT` (or `ROOMFUL_PORT`) | `8787`      | TCP port to listen on (`ROOMFUL_PORT` takes precedence over `PORT`)                                                                        |
| `HOST`                     | `127.0.0.1` | Interface to bind the relay server to                                                                                                      |
| `MAX_CONNECTIONS`          | unset       | Optional concurrent WebSocket connection cap                                                                                               |
| `ROOMFUL_MAX_ROOM_SIZE`    | unset       | Hard per-room peer cap                                                                                                                     |
| `ROOMFUL_CORS_ORIGIN`      | unset       | Allowed browser origin; adds CORS headers on HTTP responses and rejects WebSocket upgrades from other origins. Use `*` to allow any origin |
| `ROOMFUL_AUTH_SECRET`      | unset       | Enables built-in HS256 JWT authorization; peers must present a valid token signed with this secret                                         |
| `ROOMFUL_REDIS_URL`        | unset       | Optional Redis URL for multi-instance coordination                                                                                         |

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## Docker

Official image:

```bash
docker pull roomful/relay:latest
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 roomful/relay:latest
```

Local and production Compose examples live at the repository root in `docker-compose.yml` and
`docker-compose.prod.yml`.
