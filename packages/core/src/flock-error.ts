/**
 * Enumerates the public FlockJS error codes.
 */
export type FlockErrorCode =
  | 'ROOM_FULL'
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'DECRYPTION_ERROR'
  | 'INVALID_STATE';

/**
 * Represents an operational error raised by FlockJS.
 */
export class FlockError extends Error {
  /**
   * Identifies the error category.
   */
  public readonly code: FlockErrorCode;

  /**
   * Indicates whether retrying the operation may succeed.
   */
  public readonly recoverable: boolean;

  /**
   * Exposes the original cause when available.
   */
  public readonly cause: unknown;

  /**
   * Creates a new `FlockError`.
   *
   * @param code - The public error code.
   * @param message - The human-readable error message.
   * @param recoverable - Whether the caller can reasonably retry.
   * @param cause - The original cause when available.
   * @returns A new `FlockError` instance.
   */
  public constructor(code: FlockErrorCode, message: string, recoverable: boolean, cause?: unknown) {
    super(message);
    this.name = 'FlockError';
    this.code = code;
    this.recoverable = recoverable;
    this.cause = cause;
  }
}

/**
 * Creates a `FlockError` instance.
 *
 * @param code - The public error code.
 * @param message - The human-readable error message.
 * @param recoverable - Whether the caller can reasonably retry.
 * @param cause - The original cause when available.
 * @returns The created `FlockError`.
 */
export function createFlockError(
  code: FlockErrorCode,
  message: string,
  recoverable: boolean,
  cause?: unknown,
): FlockError {
  return new FlockError(code, message, recoverable, cause);
}
