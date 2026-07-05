# @roomful/cursors

## 1.0.11

### Patch Changes

- Updated dependencies [dbb633e]
- Updated dependencies [dbb633e]
- Updated dependencies [5138c44]
- Updated dependencies [bd210b1]
- Updated dependencies [a5fdc0e]
  - @roomful/react@1.6.0
  - @roomful/core@1.9.0

## 1.0.10

### Patch Changes

- Updated dependencies [7ffc235]
- Updated dependencies [9bd411a]
- Updated dependencies [9bd411a]
- Updated dependencies [c4369d9]
- Updated dependencies [bbba327]
- Updated dependencies [018f001]
- Updated dependencies [018f001]
  - @roomful/core@1.8.0
  - @roomful/react@1.5.0

## 1.0.9

### Patch Changes

- Updated dependencies [804681c]
  - @roomful/core@1.7.0
  - @roomful/react@1.4.1

## 1.0.8

### Patch Changes

- Updated dependencies [db6c216]
- Updated dependencies [db6c216]
  - @roomful/core@1.6.0
  - @roomful/react@1.4.0

## 1.0.7

### Patch Changes

- Updated dependencies [2dd0386]
- Updated dependencies [8f0c6ff]
- Updated dependencies [bc3f52c]
- Updated dependencies [bc3f52c]
- Updated dependencies [0e9aa21]
- Updated dependencies [58d8843]
- Updated dependencies [8114214]
- Updated dependencies [6472822]
  - @roomful/core@1.5.0
  - @roomful/react@1.3.0

## 1.0.6

### Patch Changes

- Updated dependencies [5b11b46]
  - @roomful/core@1.4.0
  - @roomful/react@1.2.2

## 1.0.5

### Patch Changes

- Updated dependencies [9d36007]
- Updated dependencies [233153b]
  - @roomful/core@1.3.0
  - @roomful/react@1.2.1

## 1.0.4

### Patch Changes

- Updated dependencies [3ef72a4]
  - @roomful/core@1.2.0
  - @roomful/react@1.2.0

## 1.0.3

### Patch Changes

- 3055e9e: Refresh package metadata for the v1.5 line: add npm descriptions to the packages that were missing them and update the README stable badge to v1.5. Documentation and metadata only -- no code or API changes.
- Updated dependencies [3055e9e]
  - @roomful/core@1.1.1
  - @roomful/react@1.1.1

## 1.0.2

### Patch Changes

- Updated dependencies [6172ae7]
- Updated dependencies [e886803]
- Updated dependencies [f10f232]
- Updated dependencies [b6f8bcc]
- Updated dependencies [66eeac0]
  - @roomful/core@1.1.0
  - @roomful/react@1.1.0

## 1.0.1

### Patch Changes

- 6f4e1f5: Stable 1.0.1.
  - core: the `'custom'` shared-state strategy now syncs across peers, resolving conflicts via the
    user-provided `merge` function (previously it ran local-only and never propagated).
  - Drop beta framing now that 1.0 is stable: README/docs install commands no longer use the `@beta`
    tag, status badges read "stable", and the Docker examples use the `:latest` image tag.

- Updated dependencies [6f4e1f5]
  - @roomful/core@1.0.1
  - @roomful/react@1.0.1

## 1.0.0

### Patch Changes

- fbd0751: API-freeze hardening for the stable 1.0.
  - Vue and Svelte adapters gain connection-status and error/lifecycle observation
    (useConnectionStatus / status store + onConnect/onDisconnect/onError), reaching parity with React.
  - Svelte state.shared now takes (key, options) with initialValue in options, matching useSharedState.
  - Removed the no-op Health stubs from core and react.
  - core/adapter-runtime is marked internal and excluded from the public API docs.
  - Relay CLI gains --cors-origin, --auth-secret, --max-room-size; Redis coordination is experimental.
  - Devtools ships the window.**roomful_devtools** typing, accepts the custom state strategy in its
    guard, and marks the bridge protocol experimental.
  - Documented non-exhaustive unions and merge-vs-replace engine semantics.

- efdbbd0: Add react and @types/react as root devDependencies so the docs snippet
  validator can resolve react/jsx-runtime under a clean CI install. A stray
  react in the developer home directory masked the missing root dependency.
- 8ef5cd7: Fix the remaining release pipeline gates so packages can publish: ignore the
  changeset-generated .changeset/pre.json in prettier, and scope the root
  typecheck to packages so app-only TSX/Astro source no longer fails it.
- 343472a: Fix the release pipeline so the packages can publish. CI lints the framework
  adapters before building @roomful/core, and the @roomful/core/adapter-runtime
  subpath did not resolve pre-build, failing the lint gate. The base tsconfig now
  maps that subpath to source, so lint and typecheck resolve it without a build.
- 2361597: Skip the changeset status check during release when changesets pre mode is
  active. The release workflow ran changeset status on a tag-triggered shallow
  checkout, which has no main branch to diff against, so it failed right before
  publishing. In pre mode changeset files persist after versioning, so the
  existing empty-changeset guard never applied.
- c195284: Publish the relay Docker image under the erayatesdev/roomful namespace because
  Docker Hub no longer offers a free organization tier. No package code changes;
  this release re-runs the pipeline so the relay image publishes.
- Updated dependencies [fbd0751]
- Updated dependencies [49c4c5e]
- Updated dependencies [efdbbd0]
- Updated dependencies [8ef5cd7]
- Updated dependencies [343472a]
- Updated dependencies [2361597]
- Updated dependencies [c195284]
  - @roomful/core@1.0.0
  - @roomful/react@1.0.0

## 1.0.0-beta.7

### Patch Changes

- 1aa3efa: Publish the relay Docker image under the erayatesdev/roomful namespace because
  Docker Hub no longer offers a free organization tier. No package code changes;
  this release re-runs the pipeline so the relay image publishes.
- Updated dependencies [1aa3efa]
  - @roomful/core@1.0.0-beta.7
  - @roomful/react@1.0.0-beta.7

## 1.0.0-beta.6

### Patch Changes

- 2361597: Skip the changeset status check during release when changesets pre mode is
  active. The release workflow ran changeset status on a tag-triggered shallow
  checkout, which has no main branch to diff against, so it failed right before
  publishing. In pre mode changeset files persist after versioning, so the
  existing empty-changeset guard never applied.
- Updated dependencies [2361597]
  - @roomful/core@1.0.0-beta.6
  - @roomful/react@1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- efdbbd0: Add react and @types/react as root devDependencies so the docs snippet
  validator can resolve react/jsx-runtime under a clean CI install. A stray
  react in the developer home directory masked the missing root dependency.
- Updated dependencies [efdbbd0]
  - @roomful/core@1.0.0-beta.5
  - @roomful/react@1.0.0-beta.5

## 1.0.0-beta.4

### Patch Changes

- 8ef5cd7: Fix the remaining release pipeline gates so packages can publish: ignore the
  changeset-generated .changeset/pre.json in prettier, and scope the root
  typecheck to packages so app-only TSX/Astro source no longer fails it.
- Updated dependencies [8ef5cd7]
  - @roomful/core@1.0.0-beta.4
  - @roomful/react@1.0.0-beta.4

## 1.0.0-beta.3

### Patch Changes

- Fix the release pipeline so the packages can publish. CI lints the framework
  adapters before building @roomful/core, and the @roomful/core/adapter-runtime
  subpath did not resolve pre-build, failing the lint gate. The base tsconfig now
  maps that subpath to source, so lint and typecheck resolve it without a build.
- Updated dependencies
  - @roomful/core@1.0.0-beta.3
  - @roomful/react@1.0.0-beta.3

## 1.0.0-beta.2

### Patch Changes

- Updated dependencies [49c4c5e]
  - @roomful/core@1.0.0-beta.2
  - @roomful/react@1.0.0-beta.2

## 1.0.0

### Major Changes

Initial public release of `@roomful/cursors`, the prebuilt collaboration UI components for Roomful.

- `PeerCursor` live cursor rendering with styles, names, and cleanup.
- `FloatingReaction` ephemeral reaction animations.
- `PresenceBar`, `PresenceAvatars`, and `TypingIndicator`/`LiveIndicator` primitives for React apps.
- Framework-agnostic presence and indicator utilities.
