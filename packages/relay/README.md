# @cahoots/relay

Self-hosted relay server for Cahoots WebRTC signaling and WebSocket room transport.

## Install

Library usage:

```bash
npm install @cahoots/relay
```

Global CLI usage:

```bash
npm install -g @cahoots/relay
```

## Run

CLI flags:

```bash
cahoots-relay --port 8080
cahoots-relay --host 0.0.0.0 --port 8787 --max-connections 1000
cahoots-relay --redis-url redis://127.0.0.1:6379/0
cahoots-relay --version
```

Environment variables:

| Variable                   | Default     | Description                                                                                                                                |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT` (or `CAHOOTS_PORT`) | `8787`      | TCP port to listen on (`CAHOOTS_PORT` takes precedence over `PORT`)                                                                        |
| `HOST`                     | `127.0.0.1` | Interface to bind the relay server to                                                                                                      |
| `MAX_CONNECTIONS`          | unset       | Optional concurrent WebSocket connection cap                                                                                               |
| `CAHOOTS_MAX_ROOM_SIZE`    | unset       | Hard per-room peer cap                                                                                                                     |
| `CAHOOTS_CORS_ORIGIN`      | unset       | Allowed browser origin; adds CORS headers on HTTP responses and rejects WebSocket upgrades from other origins. Use `*` to allow any origin |
| `CAHOOTS_AUTH_SECRET`      | unset       | Enables built-in HS256 JWT authorization; peers must present a valid token signed with this secret                                         |
| `CAHOOTS_REDIS_URL`        | unset       | Optional Redis URL for multi-instance coordination                                                                                         |

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## Docker

Official image:

```bash
docker pull cahoots/relay:latest
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 cahoots/relay:latest
```

Local and production Compose examples live at the repository root in `docker-compose.yml` and
`docker-compose.prod.yml`.
