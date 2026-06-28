/** @internal — internal adapter glue, NO stability guarantee, exempt from semver. */

import { RoomfulError } from './roomful-error';
import type {
  AwarenessState,
  CursorData,
  CursorPosition,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  StateOptions,
} from './types';

/**
 * Internal runtime shared by the first-party framework adapters
 * (`@roomful/react`, `@roomful/vue`, `@roomful/svelte`): structural-equality
 * checks for snapshot render bail-out plus the single shared-state binding guards.
 *
 * Not part of the stable public API — imported via `@roomful/core/adapter-runtime`
 * by the first-party adapters only.
 */

/**
 * Narrows a value to a non-array object.
 */
export function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrows a value to a plain (`Object.prototype`) record.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObjectLike(value)) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Deep-compares two JSON-like values (arrays and plain objects, recursively).
 */
export function areStructuredValuesEqual(previous: unknown, next: unknown): boolean {
  if (previous === next) {
    return true;
  }

  if (Array.isArray(previous) || Array.isArray(next)) {
    if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length) {
      return false;
    }

    for (let index = 0; index < previous.length; index += 1) {
      if (!areStructuredValuesEqual(previous[index], next[index])) {
        return false;
      }
    }

    return true;
  }

  if (!isPlainObject(previous) || !isPlainObject(next)) {
    return false;
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!areStructuredValuesEqual(Reflect.get(previous, key), Reflect.get(next, key))) {
      return false;
    }
  }

  return true;
}

/**
 * Structured-clones a value when the runtime supports it, otherwise returns it as-is.
 */
export function cloneStructuredValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value;
}

/**
 * Compares two peers, ignoring the volatile `lastSeen` field.
 */
export function arePeersEqual<TPresence extends PresenceData>(
  previous: Peer<TPresence>,
  next: Peer<TPresence>,
): boolean {
  if (previous === next) {
    return true;
  }

  const previousKeys = Object.keys(previous).filter((key) => {
    return key !== 'lastSeen';
  });
  const nextKeys = Object.keys(next).filter((key) => {
    return key !== 'lastSeen';
  });

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!areStructuredValuesEqual(Reflect.get(previous, key), Reflect.get(next, key))) {
      return false;
    }
  }

  return true;
}

/**
 * Compares two peer arrays element-wise via {@link arePeersEqual}.
 */
export function arePeerArraysEqual<TPresence extends PresenceData>(
  previous: readonly Peer<TPresence>[],
  next: readonly Peer<TPresence>[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousPeer = previous[index];
    const nextPeer = next[index];

    if (!previousPeer || !nextPeer || !arePeersEqual(previousPeer, nextPeer)) {
      return false;
    }
  }

  return true;
}

/**
 * Compares two cursor positions key-by-key.
 */
export function areCursorPositionsEqual<TCursor extends CursorData>(
  previous: CursorPosition<TCursor>,
  next: CursorPosition<TCursor>,
): boolean {
  if (previous === next) {
    return true;
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of previousKeys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      return false;
    }

    if (!areStructuredValuesEqual(Reflect.get(previous, key), Reflect.get(next, key))) {
      return false;
    }
  }

  return true;
}

/**
 * Compares two cursor-position arrays element-wise via {@link areCursorPositionsEqual}.
 */
export function areCursorArraysEqual<TCursor extends CursorData>(
  previous: readonly CursorPosition<TCursor>[],
  next: readonly CursorPosition<TCursor>[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousCursor = previous[index];
    const nextCursor = next[index];

    if (!previousCursor || !nextCursor || !areCursorPositionsEqual(previousCursor, nextCursor)) {
      return false;
    }
  }

  return true;
}

/**
 * Compares two awareness-state arrays element-wise.
 */
export function areAwarenessArraysEqual(
  previous: readonly AwarenessState[],
  next: readonly AwarenessState[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousEntry = previous[index];
    const nextEntry = next[index];

    if (!previousEntry || !nextEntry || !areStructuredValuesEqual(previousEntry, nextEntry)) {
      return false;
    }
  }

  return true;
}

/**
 * Resolves the local peer from a peer list, falling back to the engine's self snapshot.
 */
export function readSelfPeer<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  peers: readonly Peer<TPresence>[],
): Peer<TPresence> {
  for (const peer of peers) {
    if (peer.id === room.peerId) {
      return peer;
    }
  }

  return presence.getSelf();
}

/**
 * A resolved single shared-state binding captured for a room/adapter.
 */
export interface SharedStateBinding {
  key: string;
  strategy: 'lww' | 'crdt';
  initialValue: unknown;
  persist: boolean;
}

/**
 * Error-message labels so each adapter keeps its own public method name in thrown errors.
 */
export interface SharedStateBindingLabels {
  /**
   * Names the adapter method shown in errors, e.g. `useSharedState` or `state.shared`.
   */
  method: string;

  /**
   * Names the container shown in errors, e.g. `room` or `adapter`.
   */
  container: string;
}

const DEFAULT_BINDING_LABELS: SharedStateBindingLabels = {
  method: 'useSharedState',
  container: 'room',
};

/**
 * Normalizes and validates a shared-state strategy, defaulting to `lww`.
 */
export function normalizeSharedStateStrategy(
  strategy: StateOptions<unknown>['strategy'],
  currentStrategy?: 'lww' | 'crdt',
): 'lww' | 'crdt' {
  const normalized = strategy ?? currentStrategy ?? 'lww';
  if (normalized === 'lww' || normalized === 'crdt') {
    return normalized;
  }

  throw new RoomfulError(
    'INVALID_STATE',
    `State strategy "${normalized}" is not implemented in this runtime. Use "lww" or "crdt".`,
    false,
    {
      strategy: normalized,
    },
  );
}

/**
 * Builds the binding record captured for the room's single shared-state binding.
 */
export function createSharedStateBinding<T>(
  key: string,
  options: StateOptions<T>,
): SharedStateBinding {
  return {
    key,
    strategy: normalizeSharedStateStrategy(options.strategy),
    initialValue: cloneStructuredValue(options.initialValue),
    persist: options.persist === true,
  };
}

/**
 * Asserts a second shared-state binding request matches the room's existing binding.
 *
 * @param labels - Adapter-specific error wording; defaults to `useSharedState`/`room`.
 */
export function assertCompatibleSharedStateBinding<T>(
  binding: SharedStateBinding,
  key: string,
  options: StateOptions<T>,
  labels: SharedStateBindingLabels = DEFAULT_BINDING_LABELS,
): void {
  if (binding.key !== key) {
    throw new RoomfulError(
      'INVALID_STATE',
      `${labels.method}() is already bound to key "${binding.key}" for this ${labels.container}.`,
      false,
      {
        currentKey: binding.key,
        requestedKey: key,
      },
    );
  }

  const normalizedStrategy = normalizeSharedStateStrategy(options.strategy, binding.strategy);
  if (binding.strategy !== normalizedStrategy) {
    throw new RoomfulError(
      'INVALID_STATE',
      `${labels.method}("${key}") is already configured with strategy "${binding.strategy}".`,
      false,
      {
        currentStrategy: binding.strategy,
        requestedStrategy: normalizedStrategy,
      },
    );
  }

  if (!areStructuredValuesEqual(binding.initialValue, options.initialValue)) {
    throw new RoomfulError(
      'INVALID_STATE',
      `${labels.method}("${key}") received a different initialValue for the same ${labels.container}.`,
      false,
    );
  }

  const requestedPersist = options.persist === true;
  if (binding.persist === requestedPersist) {
    return;
  }

  if (!binding.persist && requestedPersist && binding.strategy === 'lww') {
    return;
  }

  if (requestedPersist && binding.strategy !== 'lww') {
    throw new RoomfulError(
      'INVALID_STATE',
      'State persistence is only supported for the "lww" strategy.',
      false,
      {
        strategy: binding.strategy,
        persist: requestedPersist,
      },
    );
  }

  throw new RoomfulError(
    'INVALID_STATE',
    `${labels.method}("${key}") persistence is already enabled for this ${labels.container}.`,
    false,
    {
      persist: binding.persist,
      requestedPersist,
    },
  );
}
