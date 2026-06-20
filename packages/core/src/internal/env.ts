import { createCahootsError } from '../cahoots-error';

export type WindowEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

function readGlobalCrypto(): Crypto | null {
  return typeof crypto === 'undefined' ? null : crypto;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNodeEnv(): string | null {
  const globalValue: unknown = globalThis;
  if (!isRecord(globalValue)) {
    return null;
  }

  const processValue = globalValue.process;
  if (!isRecord(processValue)) {
    return null;
  }

  const envValue = processValue.env;
  if (!isRecord(envValue)) {
    return null;
  }

  const nodeEnv = envValue.NODE_ENV;
  return typeof nodeEnv === 'string' ? nodeEnv : null;
}

export const env = {
  get isBrowser(): boolean {
    return typeof window !== 'undefined';
  },
  get crypto(): Crypto | null {
    return readGlobalCrypto();
  },
  get nodeEnv(): string | null {
    return readNodeEnv();
  },
  get hasLocalStorage(): boolean {
    try {
      return typeof globalThis.localStorage !== 'undefined';
    } catch {
      return false;
    }
  },
  get hasBroadcastChannel(): boolean {
    return typeof BroadcastChannel !== 'undefined';
  },
  get hasRTCPeerConnection(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  },
  get hasWebSocket(): boolean {
    return typeof WebSocket !== 'undefined';
  },
  get hasFetch(): boolean {
    return typeof fetch === 'function';
  },
  get hasDocument(): boolean {
    return typeof document !== 'undefined';
  },
  get hasCryptoRandomUUID(): boolean {
    return typeof readGlobalCrypto()?.randomUUID === 'function';
  },
  get hasCryptoGetRandomValues(): boolean {
    return typeof readGlobalCrypto()?.getRandomValues === 'function';
  },
};

export function getWindowEventTarget(): WindowEventTarget | null {
  if (!env.isBrowser) {
    return null;
  }

  if (
    typeof window.addEventListener !== 'function' ||
    typeof window.removeEventListener !== 'function'
  ) {
    return null;
  }

  return window;
}

export function createRuntimePeerId(): string {
  const runtimeCrypto = env.crypto;
  if (typeof runtimeCrypto?.randomUUID === 'function') {
    return runtimeCrypto.randomUUID();
  }

  if (!runtimeCrypto || typeof runtimeCrypto.getRandomValues !== 'function') {
    throw createCahootsError(
      'NETWORK_ERROR',
      'Secure random peer ID generation is unavailable in this runtime.',
      false,
      {
        source: 'peer-id',
        kind: 'secure-random-unavailable',
      },
    );
  }

  const bytes = new Uint8Array(16);
  runtimeCrypto.getRandomValues(bytes);

  const versionByte = bytes[6];
  const variantByte = bytes[8];
  if (versionByte === undefined || variantByte === undefined) {
    throw createCahootsError(
      'NETWORK_ERROR',
      'Secure random peer ID generation produced invalid byte output.',
      false,
      {
        source: 'peer-id',
        kind: 'invalid-random-output',
      },
    );
  }

  bytes[6] = (versionByte & 0x0f) | 0x40;
  bytes[8] = (variantByte & 0x3f) | 0x80;

  const segments = [
    bytesToHex(bytes, 0, 4),
    bytesToHex(bytes, 4, 6),
    bytesToHex(bytes, 6, 8),
    bytesToHex(bytes, 8, 10),
    bytesToHex(bytes, 10, 16),
  ];

  return segments.join('-');
}

function bytesToHex(bytes: Uint8Array, start: number, end: number): string {
  let hex = '';

  for (const byte of bytes.subarray(start, end)) {
    hex += byte.toString(16).padStart(2, '0');
  }

  return hex;
}
