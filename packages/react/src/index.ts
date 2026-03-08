import type { PresenceData, Room, RoomOptions } from '@flockjs/core';
import { createCoreHealth, createRoom, FlockError } from '@flockjs/core';
import type { ReactNode } from 'react';
import { createContext, createElement, useContext, useEffect, useRef } from 'react';

export interface ReactHealth {
  packageName: '@flockjs/react';
  status: 'ok';
  dependencies: {
    core: ReturnType<typeof createCoreHealth>;
  };
}

export interface FlockProviderProps<
  TPresence extends PresenceData = PresenceData,
> extends RoomOptions<TPresence> {
  roomId: string;
  children?: ReactNode;
  onConnect?: () => void;
  onDisconnect?: (payload: { reason?: string }) => void;
  onError?: (error: FlockError) => void;
}

interface RoomDefinition<TPresence extends PresenceData> {
  roomId: string;
  options: RoomOptions<TPresence>;
}

interface RoomSlot<TPresence extends PresenceData> {
  definition: RoomDefinition<TPresence>;
  room: Room<TPresence>;
}

interface ProviderCallbacks {
  onConnect: (() => void) | undefined;
  onDisconnect: ((payload: { reason?: string }) => void) | undefined;
  onError: ((error: FlockError) => void) | undefined;
}

const FlockRoomContext = createContext<unknown>(null);
FlockRoomContext.displayName = 'FlockRoomContext';

export function createReactHealth(): ReactHealth {
  return {
    packageName: '@flockjs/react',
    status: 'ok',
    dependencies: {
      core: createCoreHealth(),
    },
  };
}

export function FlockProvider<TPresence extends PresenceData = PresenceData>(
  props: FlockProviderProps<TPresence>,
): ReactNode {
  const callbacksRef = useRef<ProviderCallbacks>({
    onConnect: props.onConnect,
    onDisconnect: props.onDisconnect,
    onError: props.onError,
  });
  callbacksRef.current = {
    onConnect: props.onConnect,
    onDisconnect: props.onDisconnect,
    onError: props.onError,
  };

  const roomDefinition = createRoomDefinition(props);
  const roomSlotRef = useRef<RoomSlot<TPresence> | null>(null);
  let roomSlot = roomSlotRef.current;

  if (roomSlot === null || !areRoomDefinitionsEqual(roomSlot.definition, roomDefinition)) {
    roomSlot = {
      definition: roomDefinition,
      room: createRoom(roomDefinition.roomId, roomDefinition.options),
    };
    roomSlotRef.current = roomSlot;
  }

  const room = roomSlot.room;

  useEffect(() => {
    const unsubscribeConnected = room.on('connected', () => {
      callbacksRef.current.onConnect?.();
    });
    const unsubscribeDisconnected = room.on('disconnected', (payload) => {
      callbacksRef.current.onDisconnect?.(payload);
    });
    const unsubscribeError = room.on('error', (error) => {
      callbacksRef.current.onError?.(error);
    });

    void room.connect().catch(() => {
      return undefined;
    });

    return () => {
      unsubscribeError();
      unsubscribeDisconnected();
      unsubscribeConnected();

      void room.disconnect().catch(() => {
        return undefined;
      });
    };
  }, [room]);

  return createElement(FlockRoomContext.Provider, { value: room }, props.children);
}

export function useRoom<TPresence extends PresenceData = PresenceData>(): Room<TPresence> {
  const room = useContext(FlockRoomContext);

  if (!isRoom<TPresence>(room)) {
    throw new FlockError('INVALID_STATE', 'useRoom() must be used within a FlockProvider.', false);
  }

  return room;
}

function createRoomDefinition<TPresence extends PresenceData = PresenceData>(
  props: FlockProviderProps<TPresence>,
): RoomDefinition<TPresence> {
  const options: RoomOptions<TPresence> = {};

  if (props.transport !== undefined) {
    options.transport = props.transport;
  }

  if (props.presence !== undefined) {
    options.presence = props.presence;
  }

  if (props.maxPeers !== undefined) {
    options.maxPeers = props.maxPeers;
  }

  if (props.stunUrls !== undefined) {
    options.stunUrls = props.stunUrls;
  }

  if (props.relayUrl !== undefined) {
    options.relayUrl = props.relayUrl;
  }

  if (props.relayAuth !== undefined) {
    options.relayAuth = props.relayAuth;
  }

  if (props.reconnect !== undefined) {
    options.reconnect = props.reconnect;
  }

  if (props.webrtc !== undefined) {
    options.webrtc = props.webrtc;
  }

  if (props.encryption !== undefined) {
    options.encryption = props.encryption;
  }

  if (props.debug !== undefined) {
    options.debug = props.debug;
  }

  return {
    roomId: props.roomId,
    options,
  };
}

function areRoomDefinitionsEqual<TPresence extends PresenceData = PresenceData>(
  a: RoomDefinition<TPresence>,
  b: RoomDefinition<TPresence>,
): boolean {
  return a.roomId === b.roomId && areRoomOptionsEqual(a.options, b.options);
}

function areRoomOptionsEqual<TPresence extends PresenceData = PresenceData>(
  a: RoomOptions<TPresence>,
  b: RoomOptions<TPresence>,
): boolean {
  return (
    a.transport === b.transport &&
    areShallowArraysEqual(a.stunUrls, b.stunUrls) &&
    areShallowObjectsEqual(a.presence, b.presence) &&
    a.maxPeers === b.maxPeers &&
    a.relayUrl === b.relayUrl &&
    a.relayAuth === b.relayAuth &&
    areShallowValuesEqual(a.reconnect, b.reconnect) &&
    areShallowObjectsEqual(a.webrtc, b.webrtc) &&
    areShallowValuesEqual(a.encryption, b.encryption) &&
    areShallowValuesEqual(a.debug, b.debug)
  );
}

function areShallowArraysEqual<T>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b || a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

function areShallowValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (!isObjectLike(a) || !isObjectLike(b)) {
    return false;
  }

  return areShallowObjectsEqual(a, b);
}

function areShallowObjectsEqual(a: object | undefined, b: object | undefined): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      Reflect.get(a, key) !== Reflect.get(b, key)
    ) {
      return false;
    }
  }

  return true;
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRoom<TPresence extends PresenceData = PresenceData>(
  value: unknown,
): value is Room<TPresence> {
  if (!isObjectLike(value)) {
    return false;
  }

  return (
    typeof Reflect.get(value, 'id') === 'string' &&
    typeof Reflect.get(value, 'peerId') === 'string' &&
    hasFunction(value, 'connect') &&
    hasFunction(value, 'disconnect') &&
    hasFunction(value, 'usePresence') &&
    hasFunction(value, 'useCursors') &&
    hasFunction(value, 'useState') &&
    hasFunction(value, 'useAwareness') &&
    hasFunction(value, 'useEvents') &&
    hasFunction(value, 'getYDoc') &&
    hasFunction(value, 'getYProvider') &&
    hasFunction(value, 'on') &&
    hasFunction(value, 'off')
  );
}

function hasFunction(value: object, key: string): boolean {
  return typeof Reflect.get(value, key) === 'function';
}
