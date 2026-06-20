# @flockjs/relay

Self-hosted relay server for FlockJS WebRTC signaling and WebSocket room transport.

## Install

Library usage:

```bash
npm install @flockjs/relay
```

Global CLI usage:

```bash
npm install -g @flockjs/relay
```

## Run

CLI flags:

```bash
flockjs-relay --port 8080
flockjs-relay --host 0.0.0.0 --port 8787 --max-connections 1000
flockjs-relay --redis-url redis://127.0.0.1:6379/0
flockjs-relay --version
```

Environment variables:

| Variable          | Default     | Description                                        |
| ----------------- | ----------- | -------------------------------------------------- |
| `PORT`            | `8787`      | TCP port to listen on                              |
| `HOST`            | `127.0.0.1` | Interface to bind the relay server to              |
| `MAX_CONNECTIONS` | unset       | Optional concurrent WebSocket connection cap       |
| `FLOCK_REDIS_URL` | unset       | Optional Redis URL for multi-instance coordination |

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## Docker

Official image:

```bash
docker pull flockjs/relay:latest
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 flockjs/relay:latest
```

Local and production Compose examples live at the repository root in `docker-compose.yml` and
`docker-compose.prod.yml`.
