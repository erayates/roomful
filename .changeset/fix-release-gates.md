---
'@roomful/core': patch
'@roomful/react': patch
'@roomful/vue': patch
'@roomful/svelte': patch
'@roomful/cursors': patch
---

Fix the remaining release pipeline gates so packages can publish: ignore the
changeset-generated .changeset/pre.json in prettier, and scope the root
typecheck to packages so app-only TSX/Astro source no longer fails it.
