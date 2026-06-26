# @roomful/svelte

## 1.0.0-beta.5

### Patch Changes

- efdbbd0: Add react and @types/react as root devDependencies so the docs snippet
  validator can resolve react/jsx-runtime under a clean CI install. A stray
  react in the developer home directory masked the missing root dependency.
- Updated dependencies [efdbbd0]
  - @roomful/core@1.0.0-beta.5

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

Initial public release of `@roomful/svelte`, the Svelte adapter for Roomful.

- Reactive Svelte stores for presence, shared state, cursors, awareness, and events.
- Idiomatic Svelte bindings with an explicit `svelte` peer dependency contract.
- Workspace dependency on `@roomful/core`.
