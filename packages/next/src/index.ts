/**
 * Configures {@link issueRoomfulToken}.
 */
export interface IssueRoomfulTokenOptions {
  /**
   * Supplies the relay shared secret (the relay `--auth-secret`) used to sign the token.
   */
  secret: string;

  /**
   * Sets the `sub` claim identifying the token subject.
   */
  subject?: string;

  /**
   * Sets the `roomId` claim scoping the token to a room.
   */
  roomId?: string;

  /**
   * Controls how many seconds from `issuedAt` the token remains valid.
   *
   * @defaultValue 3600
   */
  expiresInSeconds?: number;

  /**
   * Delays activation by setting the `nbf` claim this many seconds after `issuedAt`.
   */
  notBeforeSeconds?: number;

  /**
   * Overrides the `iat` claim, expressed as a Unix timestamp in seconds.
   *
   * @defaultValue The current time in seconds.
   */
  issuedAt?: number;

  /**
   * Merges additional claims into the JWT payload.
   */
  claims?: Record<string, unknown>;
}

/**
 * Describes the parameters {@link RoomfulTokenRouteOptions.authorize} may resolve to.
 */
export interface RoomfulTokenAuthorizeResult {
  /**
   * Sets the `sub` claim identifying the token subject.
   */
  subject?: string;

  /**
   * Sets the `roomId` claim scoping the token to a room.
   */
  roomId?: string;

  /**
   * Merges additional claims into the JWT payload.
   */
  claims?: Record<string, unknown>;

  /**
   * Overrides the token lifetime in seconds for this request.
   */
  expiresInSeconds?: number;
}

/**
 * Configures {@link createRoomfulTokenRoute}.
 */
export interface RoomfulTokenRouteOptions {
  /**
   * Supplies the relay shared secret used to sign issued tokens.
   */
  secret: string;

  /**
   * Authorizes the incoming request before a token is minted.
   *
   * Return a {@link RoomfulTokenAuthorizeResult} to issue a token with those claims, or return a
   * `Response` to short-circuit the handler (for example, a `401`/`403` rejection).
   *
   * @param request - The incoming request.
   * @returns The token parameters, or a `Response` to return verbatim.
   */
  authorize?: (request: Request) => Promise<RoomfulTokenAuthorizeResult | Response>;

  /**
   * Sets the default token lifetime in seconds when `authorize` does not override it.
   *
   * @defaultValue 3600
   */
  expiresInSeconds?: number;
}

const DEFAULT_EXPIRES_IN_SECONDS = 3600;

const JWT_HEADER: Record<string, unknown> = {
  alg: 'HS256',
  typ: 'JWT',
};

/**
 * Thrown when token issuance receives invalid options.
 */
export class RoomfulTokenError extends TypeError {
  /**
   * Creates a token issuance error.
   *
   * @param message - The failure message.
   * @returns A new `RoomfulTokenError` instance.
   */
  public constructor(message: string) {
    super(message);
    this.name = 'RoomfulTokenError';
  }
}

function createRoomfulTokenError(message: string): RoomfulTokenError {
  return new RoomfulTokenError(message);
}

const textEncoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function encodeJsonSegment(value: Record<string, unknown>): string {
  return encodeBase64Url(textEncoder.encode(JSON.stringify(value)));
}

async function signHmacSha256(signingInput: string, secret: string): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(signingInput),
  );

  return new Uint8Array(signature);
}

function buildPayload(options: IssueRoomfulTokenOptions): Record<string, unknown> {
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1_000);
  const expiresInSeconds = options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
  const payload: Record<string, unknown> = {
    ...options.claims,
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  };

  if (options.subject !== undefined) {
    payload.sub = options.subject;
  }

  if (options.roomId !== undefined) {
    payload.roomId = options.roomId;
  }

  if (options.notBeforeSeconds !== undefined) {
    payload.nbf = issuedAt + options.notBeforeSeconds;
  }

  return payload;
}

/**
 * Mints a relay-compatible HS256 JWT server-side using Web Crypto.
 *
 * The token format matches what `@roomful/relay`'s `verifyJWT` accepts: a compact
 * `base64url(header).base64url(payload).base64url(signature)` string signed with HMAC-SHA256. Run
 * it on a server (Node) or in the Edge runtime to issue room-scoped tokens to clients without
 * shipping the relay secret to the browser.
 *
 * @param options - The signing secret and claim configuration.
 * @returns The compact JWT string.
 * @throws {RoomfulTokenError} When `secret` is empty.
 */
export async function issueRoomfulToken(options: IssueRoomfulTokenOptions): Promise<string> {
  if (typeof options.secret !== 'string' || options.secret.length === 0) {
    throw createRoomfulTokenError('Roomful token secret must be a non-empty string.');
  }

  const encodedHeader = encodeJsonSegment(JWT_HEADER);
  const encodedPayload = encodeJsonSegment(buildPayload(options));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHmacSha256(signingInput, options.secret);

  return `${signingInput}.${encodeBase64Url(signature)}`;
}

function toIssueOptions(
  secret: string,
  defaultExpiresInSeconds: number | undefined,
  result: RoomfulTokenAuthorizeResult,
): IssueRoomfulTokenOptions {
  const issueOptions: IssueRoomfulTokenOptions = {
    secret,
  };

  if (result.subject !== undefined) {
    issueOptions.subject = result.subject;
  }

  if (result.roomId !== undefined) {
    issueOptions.roomId = result.roomId;
  }

  if (result.claims !== undefined) {
    issueOptions.claims = result.claims;
  }

  const expiresInSeconds = result.expiresInSeconds ?? defaultExpiresInSeconds;
  if (expiresInSeconds !== undefined) {
    issueOptions.expiresInSeconds = expiresInSeconds;
  }

  return issueOptions;
}

/**
 * Creates a Next.js App Router Route Handler that issues relay tokens.
 *
 * The returned handler is a Web-standard `(request: Request) => Promise<Response>`, so it can be
 * exported directly, for example `export const POST = createRoomfulTokenRoute({ ... })`. It awaits
 * `authorize`; if `authorize` returns a `Response`, that response is returned verbatim (letting the
 * app reject with `401`/`403`). Otherwise a token is minted and returned as `{ token }`.
 *
 * @param options - The signing secret and authorization hook.
 * @returns A Web-standard route handler.
 * @throws {RoomfulTokenError} When `secret` is empty.
 */
export function createRoomfulTokenRoute(
  options: RoomfulTokenRouteOptions,
): (request: Request) => Promise<Response> {
  if (typeof options.secret !== 'string' || options.secret.length === 0) {
    throw createRoomfulTokenError('Roomful token secret must be a non-empty string.');
  }

  return async (request: Request): Promise<Response> => {
    const authorized = (await options.authorize?.(request)) ?? {};

    if (authorized instanceof Response) {
      return authorized;
    }

    const token = await issueRoomfulToken(
      toIssueOptions(options.secret, options.expiresInSeconds, authorized),
    );

    return Response.json({
      token,
    });
  };
}

function isTokenResponse(value: unknown): value is { token: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'token' in value &&
    typeof Reflect.get(value, 'token') === 'string'
  );
}

/**
 * Fetches a Roomful token from a token endpoint created with {@link createRoomfulTokenRoute}.
 *
 * Use the returned token as the core client's `relayAuth` option.
 *
 * @param endpoint - The token endpoint URL.
 * @param init - Optional `fetch` init (for example, `method`, headers, or a body).
 * @returns The token string.
 * @throws {RoomfulTokenError} When the response is not ok or omits a string `token`.
 */
export async function fetchRoomfulToken(endpoint: string, init?: RequestInit): Promise<string> {
  const response = await fetch(endpoint, init);

  if (!response.ok) {
    throw createRoomfulTokenError(`Roomful token request failed with status ${response.status}.`);
  }

  const body: unknown = await response.json();
  if (!isTokenResponse(body)) {
    throw createRoomfulTokenError('Roomful token response did not include a string "token" field.');
  }

  return body.token;
}
