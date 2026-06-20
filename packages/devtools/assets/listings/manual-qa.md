# Manual QA Checklist

1. Install the unpacked Chrome build from `packages/devtools/dist/browser/chrome`.
2. Install the temporary Firefox build from `packages/devtools/dist/browser/firefox`.
3. Open a page that initializes a Cahoots room and confirm the `Cahoots` DevTools tab appears.
4. Verify connected peers and presence payloads render as peers join and leave.
5. Mutate shared state and confirm both the state tree and diff list update.
6. Emit custom events and confirm timestamps, sender labels, and payload previews update.
7. Force a reconnect or fallback and confirm room status and transport fields change.
8. Click `Inject Simulated Peer`, confirm the room shows a simulated peer, then remove it cleanly.
