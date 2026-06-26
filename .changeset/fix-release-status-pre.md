---
'@roomful/core': patch
'@roomful/react': patch
'@roomful/vue': patch
'@roomful/svelte': patch
'@roomful/cursors': patch
---

Skip the changeset status check during release when changesets pre mode is
active. The release workflow ran changeset status on a tag-triggered shallow
checkout, which has no main branch to diff against, so it failed right before
publishing. In pre mode changeset files persist after versioning, so the
existing empty-changeset guard never applied.
