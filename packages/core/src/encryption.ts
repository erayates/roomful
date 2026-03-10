import { createFlockError } from './flock-error';
import type { EncryptionOptions } from './types';

const AES_GCM_ALGORITHM = 'AES-GCM';
const DERIVED_KEY_LENGTH = 256;
const ENCRYPTION_IV_BYTES = 12;
const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_HASH = 'SHA-256';
const textEncoder = new TextEncoder();

export interface EncryptionEnvelopeHeader {
  roomId: string;
  fromPeerId: string;
  toPeerId?: string;
  timestamp: number;
  version: 1;
}

export interface EncryptedWirePayload {
  version: 1;
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export interface ResolvedRoomEncryption {
  key: CryptoKey;
  mode: 'key' | 'passphrase';
  version: 1;
}

type BinaryLike = Uint8Array | ArrayBuffer | readonly number[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getCryptoOrThrow(): Crypto {
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.subtle === 'undefined' ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    throw createFlockError(
      'ENCRYPTION_ERROR',
      'Web Crypto API encryption support is unavailable in this runtime.',
      false,
      {
        source: 'room-encryption',
        kind: 'webcrypto-unavailable',
      },
    );
  }

  return crypto;
}

function assertValidEncryptionKey(key: CryptoKey): void {
  const algorithm = isRecord(key.algorithm) ? key.algorithm : null;
  const algorithmName = typeof algorithm?.name === 'string' ? algorithm.name : undefined;
  if (key.type !== 'secret' || algorithmName !== AES_GCM_ALGORITHM) {
    throw createFlockError(
      'ENCRYPTION_ERROR',
      'Encryption key must be a secret AES-GCM CryptoKey.',
      false,
      {
        source: 'room-encryption',
        kind: 'invalid-key-algorithm',
      },
    );
  }

  if (!key.usages.includes('encrypt') || !key.usages.includes('decrypt')) {
    throw createFlockError(
      'ENCRYPTION_ERROR',
      'Encryption key must allow both encrypt and decrypt usages.',
      false,
      {
        source: 'room-encryption',
        kind: 'invalid-key-usages',
        usages: [...key.usages],
      },
    );
  }
}

function copyTextBytes(value: string): Uint8Array {
  return Uint8Array.from(textEncoder.encode(value));
}

function toArrayBuffer(value: BinaryLike): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  return Uint8Array.from(value).buffer;
}

function buildPassphraseSalt(roomId: string): ArrayBuffer {
  return toArrayBuffer(copyTextBytes(`flockjs:e2e:v1:${roomId}`));
}

function buildAdditionalAuthenticatedData(header: EncryptionEnvelopeHeader): ArrayBuffer {
  return toArrayBuffer(
    copyTextBytes(
      JSON.stringify({
        type: 'encrypted',
        roomId: header.roomId,
        fromPeerId: header.fromPeerId,
        toPeerId: header.toPeerId ?? null,
        timestamp: header.timestamp,
        version: header.version,
      }),
    ),
  );
}

export function isEncryptionEnabled(options: EncryptionOptions | undefined): boolean {
  return options !== undefined;
}

export function createEncryptionHandshake(): { version: 1 } {
  return {
    version: 1,
  };
}

export async function resolveRoomEncryption(
  roomId: string,
  options: EncryptionOptions | undefined,
): Promise<ResolvedRoomEncryption | null> {
  if (!options) {
    return null;
  }

  const webCrypto = getCryptoOrThrow();

  if ('key' in options) {
    assertValidEncryptionKey(options.key);
    return {
      key: options.key,
      mode: 'key',
      version: 1,
    };
  }

  if (!('passphrase' in options) || typeof options.passphrase !== 'string') {
    throw createFlockError(
      'ENCRYPTION_ERROR',
      'Encryption requires either a CryptoKey or passphrase.',
      false,
      {
        source: 'room-encryption',
        kind: 'invalid-options',
      },
    );
  }

  if (options.passphrase.length === 0) {
    throw createFlockError(
      'ENCRYPTION_ERROR',
      'Encryption passphrase must not be empty.',
      false,
      {
        source: 'room-encryption',
        kind: 'empty-passphrase',
      },
    );
  }

  const passphraseKey = await webCrypto.subtle.importKey(
    'raw',
    toArrayBuffer(copyTextBytes(options.passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: buildPassphraseSalt(roomId),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    passphraseKey,
    {
      name: AES_GCM_ALGORITHM,
      length: DERIVED_KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt'],
  );

  assertValidEncryptionKey(key);

  return {
    key,
    mode: 'passphrase',
    version: 1,
  };
}

export async function encryptWirePayload(
  plaintext: Uint8Array,
  header: EncryptionEnvelopeHeader,
  key: CryptoKey,
): Promise<EncryptedWirePayload> {
  const webCrypto = getCryptoOrThrow();
  assertValidEncryptionKey(key);

  const iv = Uint8Array.from(webCrypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTES)));
  const ciphertext = await webCrypto.subtle.encrypt(
    {
      name: AES_GCM_ALGORITHM,
      iv: toArrayBuffer(iv),
      additionalData: buildAdditionalAuthenticatedData(header),
    },
    key,
    toArrayBuffer(plaintext),
  );

  return {
    version: 1,
    iv,
    ciphertext: new Uint8Array(ciphertext),
  };
}

export async function decryptWirePayload(
  payload: {
    version: 1;
    iv: BinaryLike;
    ciphertext: BinaryLike;
  },
  header: EncryptionEnvelopeHeader,
  key: CryptoKey,
): Promise<Uint8Array> {
  const webCrypto = getCryptoOrThrow();
  assertValidEncryptionKey(key);

  try {
    const plaintext = await webCrypto.subtle.decrypt(
      {
        name: AES_GCM_ALGORITHM,
        iv: toArrayBuffer(payload.iv),
        additionalData: buildAdditionalAuthenticatedData(header),
      },
      key,
      toArrayBuffer(payload.ciphertext),
    );

    return new Uint8Array(plaintext);
  } catch (error) {
    throw createFlockError(
      'DECRYPTION_ERROR',
      `Failed to decrypt message from ${header.fromPeerId}.`,
      true,
      {
        source: 'room-encryption',
        kind: 'decrypt-failed',
        roomId: header.roomId,
        fromPeerId: header.fromPeerId,
        error,
      },
    );
  }
}
