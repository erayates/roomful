import { describe, expect, it } from 'vitest';

import {
  createEncryptionHandshake,
  decryptWirePayload,
  encryptWirePayload,
  isEncryptionEnabled,
  resolveRoomEncryption,
} from './encryption';

const header = {
  roomId: 'room-encrypted',
  fromPeerId: 'peer-a',
  toPeerId: 'peer-b',
  timestamp: 42,
  version: 1 as const,
};

describe('room encryption', () => {
  it('treats undefined encryption as disabled and exposes the handshake marker', () => {
    expect(isEncryptionEnabled(undefined)).toBe(false);
    expect(createEncryptionHandshake()).toEqual({ version: 1 });
  });

  it('accepts a valid AES-GCM CryptoKey', async () => {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt'],
    );

    await expect(resolveRoomEncryption('room-key', { key })).resolves.toEqual({
      key,
      mode: 'key',
      version: 1,
    });
  });

  it('rejects CryptoKeys without decrypt usage', async () => {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt'],
    );

    await expect(resolveRoomEncryption('room-key-invalid', { key })).rejects.toMatchObject({
      code: 'ENCRYPTION_ERROR',
      message: 'Encryption key must allow both encrypt and decrypt usages.',
    });
  });

  it('rejects empty passphrases', async () => {
    await expect(resolveRoomEncryption('room-passphrase-empty', { passphrase: '' })).rejects.toMatchObject(
      {
        code: 'ENCRYPTION_ERROR',
        message: 'Encryption passphrase must not be empty.',
      },
    );
  });

  it('derives compatible keys for the same room and passphrase', async () => {
    const first = await resolveRoomEncryption('room-derived', { passphrase: 'correct horse battery staple' });
    const second = await resolveRoomEncryption('room-derived', {
      passphrase: 'correct horse battery staple',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const plaintext = new TextEncoder().encode('hello encrypted world');
    const encrypted = await encryptWirePayload(plaintext, header, first!.key);
    await expect(decryptWirePayload(encrypted, header, second!.key)).resolves.toEqual(plaintext);
  });

  it('fails decryption when the room-derived salt differs', async () => {
    const first = await resolveRoomEncryption('room-a', { passphrase: 'same-secret' });
    const second = await resolveRoomEncryption('room-b', { passphrase: 'same-secret' });
    const plaintext = new TextEncoder().encode('wrong salt');
    const encrypted = await encryptWirePayload(plaintext, header, first!.key);

    await expect(decryptWirePayload(encrypted, header, second!.key)).rejects.toMatchObject({
      code: 'DECRYPTION_ERROR',
    });
  });

  it('fails decryption when ciphertext or AAD is tampered', async () => {
    const resolved = await resolveRoomEncryption('room-tamper', {
      passphrase: 'tamper-secret',
    });
    const plaintext = new TextEncoder().encode('tamper me');
    const encrypted = await encryptWirePayload(plaintext, header, resolved!.key);

    const tamperedCiphertext = {
      ...encrypted,
      ciphertext: Uint8Array.from(encrypted.ciphertext, (value, index) => {
        return index === 0 ? value ^ 0xff : value;
      }),
    };
    await expect(decryptWirePayload(tamperedCiphertext, header, resolved!.key)).rejects.toMatchObject(
      {
        code: 'DECRYPTION_ERROR',
      },
    );

    await expect(
      decryptWirePayload(
        encrypted,
        {
          ...header,
          timestamp: header.timestamp + 1,
        },
        resolved!.key,
      ),
    ).rejects.toMatchObject({
      code: 'DECRYPTION_ERROR',
    });
  });
});
