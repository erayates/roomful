/**
 * Enumerates the public Roomful error codes.
 */
export type RoomfulErrorCode =
  | 'ROOM_FULL'
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'DECRYPTION_ERROR'
  | 'INVALID_STATE';

/**
 * Represents an operational error raised by Roomful.
 */
export class RoomfulError extends Error {
  /**
   * Identifies the error category.
   */
  public readonly code: RoomfulErrorCode;

  /**
   * Indicates whether retrying the operation may succeed.
   */
  public readonly recoverable: boolean;

  /**
   * Exposes the original cause when available.
   */
  public readonly cause: unknown;

  /**
   * Creates a new `RoomfulError`.
   *
   * @param code - The public error code.
   * @param message - The human-readable error message.
   * @param recoverable - Whether the caller can reasonably retry.
   * @param cause - The original cause when available.
   * @returns A new `RoomfulError` instance.
   */
  public constructor(
    code: RoomfulErrorCode,
    message: string,
    recoverable: boolean,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'RoomfulError';
    this.code = code;
    this.recoverable = recoverable;
    this.cause = cause;
  }
}

/**
 * Creates a `RoomfulError` instance.
 *
 * @param code - The public error code.
 * @param message - The human-readable error message.
 * @param recoverable - Whether the caller can reasonably retry.
 * @param cause - The original cause when available.
 * @returns The created `RoomfulError`.
 */
export function createRoomfulError(
  code: RoomfulErrorCode,
  message: string,
  recoverable: boolean,
  cause?: unknown,
): RoomfulError {
  return new RoomfulError(code, message, recoverable, cause);
}
