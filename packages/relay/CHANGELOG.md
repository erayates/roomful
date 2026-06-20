# @cahoots/relay

## 1.0.0

### Major Changes

Initial public release of `@cahoots/relay`, the self-hostable relay server for Cahoots realtime transports.

- WebSocket signaling server with health checks and graceful reconnection support.
- Standalone CLI (`cahoots-relay`) with runtime configuration.
- Inbound protocol validation via Zod `safeParse`.
- Official Docker image and Compose deployment assets.
- Optional Redis coordination for multi-instance deployments.
