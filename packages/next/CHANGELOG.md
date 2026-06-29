# @roomful/next

## 1.1.2

### Patch Changes

- 3055e9e: Refresh package metadata for the v1.5 line: add npm descriptions to the packages that were missing them and update the README stable badge to v1.5. Documentation and metadata only -- no code or API changes.
- Updated dependencies [3055e9e]
  - @roomful/core@1.1.1

## 1.1.1

### Patch Changes

- Updated dependencies [6172ae7]
- Updated dependencies [e886803]
- Updated dependencies [f10f232]
- Updated dependencies [b6f8bcc]
- Updated dependencies [66eeac0]
  - @roomful/core@1.1.0

## 1.1.0

### Minor Changes

- 3836896: Add the Next.js auth-token package (`@roomful/next`), the final v1.1 "Ecosystem" deliverable.

  It issues short-lived HS256 JWTs in the relay's auth format from the server, so Next.js apps
  mint room-scoped tokens without exposing the relay secret to the browser: `issueRoomfulToken`
  (Web Crypto, runs in Node and Edge), `createRoomfulTokenRoute` (an App Router Route Handler
  factory), and `fetchRoomfulToken` (a client helper). Issued tokens verify against the relay's
  own `verifyJWT`.
