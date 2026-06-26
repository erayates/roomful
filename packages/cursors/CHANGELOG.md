# @roomful/cursors

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
