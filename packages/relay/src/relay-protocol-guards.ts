import { isObject } from './internal/guards.js';
import type { RelayClientMessage } from './protocol.js';

type RelayJoinProtocol = Extract<RelayClientMessage, { type: 'join' }>['protocol'];

export function isRelayJoinProtocol(value: unknown): value is RelayJoinProtocol {
  if (!isObject(value)) {
    return false;
  }

  const minVersion = value['minVersion'];
  const maxVersion = value['maxVersion'];
  const preferredCodec = value['preferredCodec'];
  const codecs = value['codecs'];
  if (
    minVersion !== 1 ||
    (maxVersion !== 1 && maxVersion !== 2) ||
    (preferredCodec !== 'json' && preferredCodec !== 'msgpack') ||
    !Array.isArray(codecs) ||
    codecs.length === 0
  ) {
    return false;
  }

  return codecs.every((codec) => codec === 'json' || codec === 'msgpack');
}
