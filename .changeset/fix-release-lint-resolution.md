---
'@roomful/core': patch
'@roomful/react': patch
'@roomful/vue': patch
'@roomful/svelte': patch
'@roomful/cursors': patch
---

Fix the release pipeline so the packages can publish. CI lints the framework
adapters before building @roomful/core, and the @roomful/core/adapter-runtime
subpath did not resolve pre-build, failing the lint gate. The base tsconfig now
maps that subpath to source, so lint and typecheck resolve it without a build.
