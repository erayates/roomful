# Self-Host Deployment Checklist

> Roomful Relay production deployment checklist. Use this when deploying the relay server in a
> self-hosted environment.

## Prerequisites

- [ ] Node.js 20+ runtime
- [ ] PostgreSQL 14+ (for management store + usage events)
- [ ] Redis 7+ (optional, for multi-instance coordination)
- [ ] Docker & Docker Compose (recommended for production)
- [ ] Domain name + TLS certificate (for WSS/WSS secure connections)
- [ ] Monitoring system (e.g. Prometheus + Grafana, Datadog)

## Installation

- [ ] Pull the relay Docker image or clone the repository
- [ ] Copy `.env.production` and fill in required values
- [ ] Run database migrations
- [ ] Verify health endpoint responds: `GET /health` → `{"status":"ok"}`

## Configuration

### Required
- [ ] Set `PORT` (default: 8787)
- [ ] Set `HOST` (default: 127.0.0.1 — use 0.0.0.0 for container)
- [ ] Set `AUTH_SECRET` — a strong random string for JWT signing
- [ ] Configure `DATABASE_URL` for PostgreSQL management store

### Optional but recommended
- [ ] Set `REDIS_URL` for multi-instance coordination
- [ ] Configure `MAX_ROOMS`, `MAX_CONNECTIONS`, `MAX_ROOM_SIZE`
- [ ] Enable management API with `--management-api` flag
- [ ] Set `CORS_ORIGIN` for browser client access
- [ ] Configure rate limits: `MESSAGE_RATE_LIMIT`, `MESSAGE_RATE_INTERVAL_MS`

## Security

- [ ] Use strong random `AUTH_SECRET` (min 32 chars)
- [ ] Enable JWT authentication for peer connections
- [ ] Restrict CORS origin to your application domain
- [ ] Run behind a reverse proxy (nginx, Caddy) for TLS termination
- [ ] Use `WSS://` protocol (WSS via reverse proxy)
- [ ] Keep PostgreSQL/Redis credentials out of version control
- [ ] Regular security updates for Node.js, PostgreSQL, Redis

## Monitoring

- [ ] Health check: `GET /health`
- [ ] Track relay metrics: active connections, room count, message throughput
- [ ] Set up log aggregation (relay logs to stdout)
- [ ] Configure alerts for: connection drops, high latency, resource usage

## Backup

- [ ] Schedule regular PostgreSQL backups (management store + usage events)
- [ ] Test backup restoration process
- [ ] Document recovery procedures

## Scaling

- [ ] Horizontal scaling: add relay instances behind a load balancer
- [ ] Enable Redis coordination for cross-instance room synchronization
- [ ] Connection pooling for PostgreSQL (relay-side)
- [ ] Consider connection limits per instance

## Production Readiness

- [ ] Load testing completed with expected concurrent users
- [ ] Rate limiting configured for production traffic
- [ ] TLS termination properly configured
- [ ] Logging level set to appropriate level (info/warn/error)
- [ ] Resource limits configured in Docker/container orchestration
