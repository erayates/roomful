# @roomful/relay

## 1.0.0

### Major Changes

Initial public release of `@roomful/relay`, the self-hostable relay server for Roomful realtime transports.

- WebSocket signaling server with health checks and graceful reconnection support.
- Standalone CLI (`roomful-relay`) with runtime configuration.
- Inbound protocol validation via Zod `safeParse`.
- Official Docker image and Compose deployment assets.
- Optional Redis coordination for multi-instance deployments.
