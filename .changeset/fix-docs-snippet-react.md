---
'@roomful/core': patch
'@roomful/react': patch
'@roomful/vue': patch
'@roomful/svelte': patch
'@roomful/cursors': patch
---

Add react and @types/react as root devDependencies so the docs snippet
validator can resolve react/jsx-runtime under a clean CI install. A stray
react in the developer home directory masked the missing root dependency.
