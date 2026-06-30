---
'@roomful/vue': minor
'@roomful/solid': minor
'@roomful/angular': minor
'@roomful/svelte': minor
---

Add the framework bindings for session recording. Vue and Solid get a `useRecording()` composable/hook, Angular gets `injectRecording()`, and Svelte's `roomful()` adapter gains a `recording` store — each exposing reactive `isRecording` / `frameCount` / `durationMs` plus `start` / `stop` / `replay` / `exportRecording`, mirroring the adapter's existing engine bindings. Wraps `room.useRecording()` from `@roomful/core`.
