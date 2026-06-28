---
'@roomful/core': patch
'@roomful/react': patch
'@roomful/vue': patch
'@roomful/svelte': patch
'@roomful/cursors': patch
'@roomful/devtools': patch
'@roomful/relay': patch
---

Stable 1.0.1.

- core: the `'custom'` shared-state strategy now syncs across peers, resolving conflicts via the
  user-provided `merge` function (previously it ran local-only and never propagated).
- Drop beta framing now that 1.0 is stable: README/docs install commands no longer use the `@beta`
  tag, status badges read "stable", and the Docker examples use the `:latest` image tag.
