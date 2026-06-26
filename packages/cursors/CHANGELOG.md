# @roomful/cursors

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
