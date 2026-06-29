# @roomful/next

Next.js server-side auth-token helpers for [Roomful](https://github.com/erayates/roomful) — mint short-lived, relay-compatible JWTs on the server so your clients join rooms without ever seeing the relay secret.

> **Stable — v1.5.** The API is stable and ready for production.

Tokens are signed with [Web Crypto](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API), so the helpers run in both the Node and Edge runtimes. There is no `next` or `react` dependency — the route handler is a Web-standard `(request: Request) => Promise<Response>`.

## Install

```bash
npm install @roomful/core @roomful/next
```

## Server: issue room-scoped tokens (App Router)

Create an App Router Route Handler. Authorize the request (check the session, look up the room), then return the claims — a relay-valid token is minted for you.

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

Fetch the token from your route, then pass it as the core client's `relayAuth`:

```ts
import { createRoom } from '@roomful/core';
import { fetchRoomfulToken } from '@roomful/next';

const room = createRoom('room-1', {
  relayUrl: 'wss://relay.roomful.dev',
  relayAuth: () => fetchRoomfulToken('/api/roomful', { method: 'POST' }),
});

await room.connect();
```

Passing `relayAuth` a function means a fresh token is fetched on every (re)connect, so short-lived tokens stay valid across reconnects.

## Low-level: mint a token directly

```ts
import { issueRoomfulToken } from '@roomful/next';

const token = await issueRoomfulToken({
  secret: process.env.ROOMFUL_RELAY_SECRET!,
  subject: 'user-123',
  roomId: 'room-1',
  expiresInSeconds: 3600, // default
});
```

The result is a compact `HS256` JWT (`iat`/`exp` set, plus `sub`/`roomId`/`nbf` and any `claims` you pass) that `@roomful/relay` verifies natively.

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference.

## License

MIT
