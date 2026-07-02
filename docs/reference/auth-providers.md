# Relay auth with Firebase, Supabase, and custom backends

Audience: users.

The relay enforces auth when it runs with a secret (`ROOMFUL_AUTH_SECRET` / `--auth-secret`): every
peer must present a valid **HS256 JWT signed with that secret**. The pattern is always the same, and
independent of your identity provider:

1. Keep the relay secret on the server — never ship it to the browser.
2. Expose an endpoint that **authorizes the request with your provider**, then mints a room-scoped
   Roomful token signed with the relay secret.
3. The client fetches a token from that endpoint and passes it to the core client as `relayAuth`.

Token minting uses [`@roomful/next`](auth-nextjs.md), whose helpers are built on Web Crypto and have
**no `next` dependency** — they run in Node, Edge, Workers, and serverless functions alike. The
Next.js guide covers the App Router specifics; this page shows the provider-verification step for a
few common backends.

Install the helpers wherever your token endpoint runs:

```bash
npm install @roomful/next
```

## Firebase Auth

The browser sends its Firebase **ID token**; the server verifies it with the Admin SDK and mints a
Roomful token scoped to the caller's `uid`.

```ts
// Server (Node, Cloud Functions, or any runtime with firebase-admin).
import { getAuth } from 'firebase-admin/auth';
import { issueRoomfulToken } from '@roomful/next';

export async function mintRoomfulToken(firebaseIdToken: string, roomId: string): Promise<string> {
  const decoded = await getAuth().verifyIdToken(firebaseIdToken);
  return issueRoomfulToken({
    secret: process.env.ROOMFUL_RELAY_SECRET!,
    subject: decoded.uid,
    roomId,
  });
}
```

## Supabase Auth

The browser sends its Supabase **access token**; the server verifies it with `auth.getUser` and mints
a Roomful token scoped to the Supabase user id. This works nicely inside a Supabase Edge Function.

```ts
// Server (Supabase Edge Function or any backend).
import { createClient } from '@supabase/supabase-js';
import { createRoomfulTokenRoute } from '@roomful/next';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export const POST = createRoomfulTokenRoute({
  secret: process.env.ROOMFUL_RELAY_SECRET!,
  authorize: async (request) => {
    const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      return new Response(null, { status: 401 });
    }

    const { roomId } = (await request.json()) as { roomId: string };
    return { subject: data.user.id, roomId };
  },
});
```

`createRoomfulTokenRoute` returns a Web-standard `(request: Request) => Promise<Response>`, so the
same handler drops into Next.js Route Handlers, Cloudflare Workers, Deno, Hono, and Supabase Edge
Functions unchanged.

## Custom backend

Any backend works: authorize the request with **your own** session (a cookie, a bearer token, a
database lookup), then mint. Return a `Response` from `authorize` to reject unauthorized callers.

```ts
import { createRoomfulTokenRoute } from '@roomful/next';

export const POST = createRoomfulTokenRoute({
  secret: process.env.ROOMFUL_RELAY_SECRET!,
  authorize: async (request) => {
    const session = await resolveSession(request); // your auth
    if (!session) {
      return new Response(null, { status: 401 });
    }

    const { roomId } = (await request.json()) as { roomId: string };
    if (!(await session.canJoin(roomId))) {
      return new Response(null, { status: 403 });
    }

    return { subject: session.userId, roomId };
  },
});
```

On Express (or any Node HTTP framework) without a Web-standard route, call `issueRoomfulToken`
directly in your handler and send back `{ token }`.

## Client: fetch the token and join

Wherever the endpoint lives, the client side is identical — pass `relayAuth` a **factory** so a fresh
token is fetched on every (re)connect:

```ts
import { createRoom } from '@roomful/core';
import { fetchRoomfulToken } from '@roomful/next';

const room = createRoom('room-1', {
  relayUrl: 'wss://relay.example',
  relayAuth: () =>
    fetchRoomfulToken('/api/roomful', {
      method: 'POST',
      headers: { authorization: `Bearer ${providerAccessToken}` },
      body: JSON.stringify({ roomId: 'room-1' }),
    }),
});

await room.connect();
```

## Relay configuration and security

- Run the relay with the **same** secret you sign tokens with: `ROOMFUL_AUTH_SECRET=your-secret`
  (see [Self-hosting](../getting-started/self-hosting.md)). The relay rejects tokens signed with any
  other key.
- Keep tokens **short-lived** (`expiresInSeconds`, default `3600`) and pass `relayAuth` a factory so
  reconnects re-fetch a fresh one.
- **Scope** each token to the room the user is authorized for (`roomId`), and set `subject` to a
  stable user id so the room can attribute presence and actions.
- Never expose `ROOMFUL_RELAY_SECRET` to the browser.

## Related docs

- [Next.js auth tokens](auth-nextjs.md)
- [Self-hosting the relay](../getting-started/self-hosting.md)
- [Reference index](README.md)
