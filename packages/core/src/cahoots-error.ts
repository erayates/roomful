/**
 * Enumerates the public Cahoots error codes.
 */
export type CahootsErrorCode =
  | 'ROOM_FULL'
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'DECRYPTION_ERROR'
  | 'INVALID_STATE';

/**
 * Represents an operational error raised by Cahoots.
 */
export class CahootsError extends Error {
  /**
   * Identifies the error category.
   */
  public readonly code: CahootsErrorCode;

  /**
   * Indicates whether retrying the operation may succeed.
   */
  public readonly recoverable: boolean;

  /**
   * Exposes the original cause when available.
   */
  public readonly cause: unknown;

  /**
   * Creates a new `CahootsError`.
   *
   * @param code - The public error code.
   * @param message - The human-readable error message.
   * @param recoverable - Whether the caller can reasonably retry.
   * @param cause - The original cause when available.
   * @returns A new `CahootsError` instance.
   */
  public constructor(
    code: CahootsErrorCode,
    message: string,
    recoverable: boolean,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'CahootsError';
    this.code = code;
    this.recoverable = recoverable;
    this.cause = cause;
  }
}

/**
 * Creates a `CahootsError` instance.
 *
 * @param code - The public error code.
 * @param message - The human-readable error message.
 * @param recoverable - Whether the caller can reasonably retry.
 * @param cause - The original cause when available.
 * @returns The created `CahootsError`.
 */
export function createCahootsError(
  code: CahootsErrorCode,
  message: string,
  recoverable: boolean,
  cause?: unknown,
): CahootsError {
  return new CahootsError(code, message, recoverable, cause);
}
