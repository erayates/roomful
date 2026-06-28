---
'@roomful/relay': patch
---

Fix the `roomful-relay` CLI not starting the server when installed globally. The entrypoint
detection compared `import.meta.url` against the symlinked `process.argv[1]` that
`npm install -g` creates on Linux, so the server was never started (the process exited
silently). It now compares resolved real paths via `realpathSync`.
