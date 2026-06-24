# @roomful/svelte

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
