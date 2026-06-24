---
'@roomful/core': patch
'@roomful/react': patch
'@roomful/vue': patch
'@roomful/svelte': patch
---

Dedupe the framework adapters' shared runtime. The structural-equality checks
(peers, cursors, awareness, deep value compare) and the single shared-state
binding guards were copy-pasted across `@roomful/react`, `@roomful/vue`, and
`@roomful/svelte`. They now live once in an internal `@roomful/core/adapter-runtime`
module that each adapter imports. No public API or behavior change; each
adapter's error wording is preserved.
