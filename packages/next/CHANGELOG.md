# @roomful/next

## 1.1.0

### Minor Changes

- 3836896: Add the Next.js auth-token package (`@roomful/next`), the final v1.1 "Ecosystem" deliverable.

  It issues short-lived HS256 JWTs in the relay's auth format from the server, so Next.js apps
  mint room-scoped tokens without exposing the relay secret to the browser: `issueRoomfulToken`
  (Web Crypto, runs in Node and Edge), `createRoomfulTokenRoute` (an App Router Route Handler
  factory), and `fetchRoomfulToken` (a client helper). Issued tokens verify against the relay's
  own `verifyJWT`.
