# Next.js Auth Tokens (`@roomful/next`)

Audience: users.

`@roomful/next` mints short-lived, relay-compatible JWTs **server-side** so your clients can join authenticated rooms without ever seeing the relay secret. Tokens are signed with [Web Crypto](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API), so the helpers run in both the Node and Edge runtimes, and the route handler is a Web-standard `(request: Request) => Promise<Response>` with no `next` or `react` dependency.

## Why

When the relay runs with an auth secret, every peer must present a valid HS256 JWT signed with that secret. You must not ship the secret to the browser. Instead:

1. Keep the secret on the server.
2. Expose an authenticated endpoint that authorizes the request and mints a room-scoped token.
3. Have the client fetch a token from that endpoint and pass it to the core client as `relayAuth`.

The token format matches what `@roomful/relay`'s JWT verification accepts, so no extra glue is required on the relay side.

## Install

```bash
npm install @roomful/core @roomful/next
```

## Server: issue room-scoped tokens (App Router)

Create an App Router Route Handler with `createRoomfulTokenRoute`. Authorize the request (check the session, look up the room), then return the claims — a relay-valid token is minted and returned as `{ token }`.

```ts
// app/api/roomful/route.ts
import { createRoomfulTokenRoute } from '@roomful/next';

export const POST = createRoomfulTokenRoute({
  secret: process.env.ROOMFUL_RELAY_SECRET!,
  authorize: async (req) => {
    const { userId, roomId } = await resolveSession(req);
    return { subject: userId, roomId };
  },
});
```

`createRoomfulTokenRoute(options)` takes:

- `secret` — the relay shared secret used to sign issued tokens. Must be non-empty (the factory throws a `RoomfulTokenError` otherwise).
- `authorize?` — runs before a token is minted. Return a `RoomfulTokenAuthorizeResult` (`subject?`, `roomId?`, `claims?`, `expiresInSeconds?`) to issue a token with those claims, or return a `Response` to short-circuit the handler — for example, a `401`/`403` rejection.
- `expiresInSeconds?` — default token lifetime when `authorize` does not override it. Defaults to `3600`.

Reject unauthorized callers by returning a `Response` from `authorize`:

```ts
authorize: async (req) => {
  if (!(await isAuthenticated(req))) {
    return new Response(null, { status: 401 });
  }
  return { subject: userId, roomId };
};
```

## Client: fetch the token and join

Fetch the token from your route, then pass it as the core client's `relayAuth`. `fetchRoomfulToken(endpoint, init?)` calls the endpoint and returns the `token` string (throwing a `RoomfulTokenError` if the response is not ok or omits a string `token`).

```ts
import { createRoom } from '@roomful/core';
import { fetchRoomfulToken } from '@roomful/next';

const room = createRoom('room-1', {
  relayUrl: 'wss://relay.roomful.dev',
  relayAuth: () => fetchRoomfulToken('/api/roomful', { method: 'POST' }),
});

await room.connect();
```

Passing `relayAuth` a **function** means a fresh token is fetched on every (re)connect, so short-lived tokens stay valid across reconnects. (`relayAuth` also accepts a static token string, but a factory is recommended for expiring tokens.)

## Low-level: mint a token directly

`issueRoomfulToken(options)` returns the compact JWT string without the route wrapper — useful in server actions, custom handlers, or non-App-Router setups.

```ts
import { issueRoomfulToken } from '@roomful/next';

const token = await issueRoomfulToken({
  secret: process.env.ROOMFUL_RELAY_SECRET!,
  subject: 'user-123',
  roomId: 'room-1',
  expiresInSeconds: 3600, // default
});
```

`IssueRoomfulTokenOptions` fields: `secret` (required), `subject?` (`sub`), `roomId?`, `expiresInSeconds?` (default `3600`), `notBeforeSeconds?` (`nbf`), `issuedAt?` (`iat`, defaults to now), and `claims?` (merged into the payload). The result is a compact `HS256` JWT with `iat`/`exp` set, plus `sub`/`roomId`/`nbf` and any extra `claims`.

## Relay configuration

This flow only applies when the relay enforces JWT authorization. Run the relay with a matching auth secret so it verifies the tokens this package mints:

```bash
roomful-relay --auth-secret your-secret
# or
ROOMFUL_AUTH_SECRET=your-secret roomful-relay
```

The relay's `--auth-secret` / `ROOMFUL_AUTH_SECRET` value and the `secret` you pass to `@roomful/next` must be the **same secret** — the relay rejects tokens signed with any other key. Without an auth secret, the relay accepts unauthenticated peers and you do not need this package.

## Related Docs

- [Auth with Firebase, Supabase, and custom backends](auth-providers.md)
- [Self-hosting the relay](../getting-started/self-hosting.md)
- [Reference index](README.md)
- [Core API](core-api.md)
- [Advanced features](advanced.md)
- [Quickstart](../getting-started/quickstart.md)
- [Docs index](../README.md)
