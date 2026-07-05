import type { RoomfulErrorCode } from './roomful-error';

/**
 * A catalog entry describing a {@link RoomfulErrorCode}: what it means and what to do about it.
 */
export interface ErrorCatalogEntry {
  /** The error code this entry describes. */
  code: RoomfulErrorCode;
  /** A short human-readable title. */
  title: string;
  /** What the error means. */
  description: string;
  /** Concrete steps to resolve or work around it. */
  remediation: string;
  /** Whether retrying the operation may reasonably succeed. */
  recoverable: boolean;
}

/**
 * The full catalog of Roomful error codes with human-readable descriptions and remediation steps.
 * Typed as an exhaustive record, so adding a new {@link RoomfulErrorCode} is a compile error until it
 * gets an entry here.
 */
export const ROOMFUL_ERROR_CATALOG: Record<RoomfulErrorCode, ErrorCatalogEntry> = {
  ROOM_FULL: {
    code: 'ROOM_FULL',
    title: 'Room is full',
    description: 'The room reached its configured participant cap, so the join was rejected.',
    remediation:
      "Raise the relay's max-room / max-peers capacity, gate joins in your app, or retry once a peer leaves.",
    recoverable: true,
  },
  AUTH_FAILED: {
    code: 'AUTH_FAILED',
    title: 'Authentication failed',
    description: 'The relay rejected the connection because its auth token was missing or invalid.',
    remediation:
      "Ensure your relay-auth token factory returns a valid, unexpired token scoped to this room, and that the relay's JWT secret matches the one that signed it.",
    recoverable: false,
  },
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    title: 'Network error',
    description: 'The transport connection failed to establish or dropped mid-session.',
    remediation:
      'Check connectivity and the relay URL. The room auto-reconnects — watch `getDiagnostics().transport.reconnectAttempt` and the room status to follow recovery.',
    recoverable: true,
  },
  ENCRYPTION_ERROR: {
    code: 'ENCRYPTION_ERROR',
    title: 'Encryption error',
    description: 'Peers disagree on the encryption mode, or the encryption key is misconfigured.',
    remediation:
      'Make every peer use the same `encryption` option and a matching key. `getDiagnostics().encryption.incompatiblePeerIds` lists the peers that disagree.',
    recoverable: false,
  },
  DECRYPTION_ERROR: {
    code: 'DECRYPTION_ERROR',
    title: 'Decryption failed',
    description: 'A received message could not be decrypted — almost always a key mismatch.',
    remediation:
      'Confirm every peer shares the identical encryption key, and rotate keys consistently across all clients at once. `getDiagnostics().encryption.decryptionErrorPeerIds` lists the affected peers.',
    recoverable: false,
  },
  INVALID_STATE: {
    code: 'INVALID_STATE',
    title: 'Invalid state',
    description: 'An operation was called in an unsupported configuration or at the wrong time.',
    remediation:
      "Check the operation's prerequisites (e.g. `useComments({ storage: 'rest' })` requires a `restEndpoint`). The thrown message names the specific violation.",
    recoverable: false,
  },
};

/**
 * Looks up the {@link ErrorCatalogEntry} for a Roomful error code — the description and remediation
 * to surface to a developer or user.
 *
 * @param code - The error code.
 * @returns The catalog entry for the code.
 */
export function describeRoomfulError(code: RoomfulErrorCode): ErrorCatalogEntry {
  return ROOMFUL_ERROR_CATALOG[code];
}
