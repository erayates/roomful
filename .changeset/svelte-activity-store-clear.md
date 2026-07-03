---
'@roomful/svelte': patch
---

Release the `activity` store's subscribers on `roomful(...)` teardown. The adapter's destroy path
clears every value store except `activityStore`, which was omitted when the activity store shipped —
so its subscribers leaked past `destroy()`. Now cleared alongside the others.
