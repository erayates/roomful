---
'@roomful/core': patch
'@roomful/react': patch
'@roomful/vue': patch
'@roomful/svelte': patch
'@roomful/cursors': patch
---

Publish the relay Docker image under the erayatesdev/roomful namespace because
Docker Hub no longer offers a free organization tier. No package code changes;
this release re-runs the pipeline so the relay image publishes.
