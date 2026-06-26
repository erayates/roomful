# @roomful/vue

## 1.0.0-beta.4

### Patch Changes

- 8ef5cd7: Fix the remaining release pipeline gates so packages can publish: ignore the
  changeset-generated .changeset/pre.json in prettier, and scope the root
  typecheck to packages so app-only TSX/Astro source no longer fails it.
- Updated dependencies [8ef5cd7]
  - @roomful/core@1.0.0-beta.4

## 1.0.0-beta.3

### Patch Changes

- Fix the release pipeline so the packages can publish. CI lints the framework
  adapters before building @roomful/core, and the @roomful/core/adapter-runtime
  subpath did not resolve pre-build, failing the lint gate. The base tsconfig now
  maps that subpath to source, so lint and typecheck resolve it without a build.
- Updated dependencies
  - @roomful/core@1.0.0-beta.3

## 1.0.0-beta.2

### Patch Changes

- 49c4c5e: Dedupe the framework adapters' shared runtime. The structural-equality checks
  (peers, cursors, awareness, deep value compare) and the single shared-state
  binding guards were copy-pasted across `@roomful/react`, `@roomful/vue`, and
  `@roomful/svelte`. They now live once in an internal `@roomful/core/adapter-runtime`
  module that each adapter imports. No public API or behavior change; each
  adapter's error wording is preserved.
- Updated dependencies [49c4c5e]
  - @roomful/core@1.0.0-beta.2

## 1.0.0

### Major Changes

Initial public release of `@roomful/vue`, the Vue adapter for Roomful.

- Composables and reactive bindings for presence, shared state, cursors, awareness, and events.
- Idiomatic Vue 3 bindings with an explicit `vue` peer dependency contract.
- Workspace dependency on `@roomful/core`.
