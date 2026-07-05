# @roomful/next

## 1.1.12

### Patch Changes

- Updated dependencies [290c934]
  - @roomful/core@1.11.0

## 1.1.11

### Patch Changes

- Updated dependencies [7300eee]
- Updated dependencies [d6ea99d]
- Updated dependencies [9da3d61]
  - @roomful/core@1.10.0

## 1.1.10

### Patch Changes

- Updated dependencies [dbb633e]
- Updated dependencies [5138c44]
- Updated dependencies [bd210b1]
- Updated dependencies [a5fdc0e]
  - @roomful/core@1.9.0

## 1.1.9

### Patch Changes

- Updated dependencies [7ffc235]
- Updated dependencies [9bd411a]
- Updated dependencies [c4369d9]
- Updated dependencies [bbba327]
- Updated dependencies [018f001]
  - @roomful/core@1.8.0

## 1.1.8

### Patch Changes

- Updated dependencies [804681c]
  - @roomful/core@1.7.0

## 1.1.7

### Patch Changes

- Updated dependencies [db6c216]
  - @roomful/core@1.6.0

## 1.1.6

### Patch Changes

- Updated dependencies [2dd0386]
- Updated dependencies [8f0c6ff]
- Updated dependencies [bc3f52c]
- Updated dependencies [0e9aa21]
- Updated dependencies [58d8843]
- Updated dependencies [8114214]
- Updated dependencies [6472822]
  - @roomful/core@1.5.0

## 1.1.5

### Patch Changes

- Updated dependencies [5b11b46]
  - @roomful/core@1.4.0

## 1.1.4

### Patch Changes

- Updated dependencies [9d36007]
- Updated dependencies [233153b]
  - @roomful/core@1.3.0

## 1.1.3

### Patch Changes

- Updated dependencies [3ef72a4]
  - @roomful/core@1.2.0

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
