import type {
  AwarenessEngine,
  AwarenessSelection,
  AwarenessState,
  CursorData,
  CursorEngine,
  CursorPosition,
  CursorRenderOptions,
  EventEngine,
  Peer,
  PresenceData,
  PresenceEngine,
  Room,
  RoomOptions,
  RoomStatus,
  StateEngine,
  StateOptions,
  Unsubscribe,
} from '@roomful/core';
import { createRoom, RoomfulError } from '@roomful/core';
import {
  areAwarenessArraysEqual,
  areCursorArraysEqual,
  areCursorPositionsEqual,
  arePeerArraysEqual,
  arePeersEqual,
  areStructuredValuesEqual,
  assertCompatibleSharedStateBinding,
  cloneStructuredValue,
  createSharedStateBinding,
  readSelfPeer,
  type SharedStateBinding,
} from '@roomful/core/adapter-runtime';
import { onDestroy, onMount } from 'svelte';
import type { Action } from 'svelte/action';
import type {
  Invalidator,
  Readable,
  Subscriber,
  Unsubscriber,
  Updater,
  Writable,
} from 'svelte/store';

const LOCKED_PRESENCE_KEYS = new Set(['id', 'joinedAt', 'lastSeen']);

type SetStateAction<T> = T | ((current: T) => T);
type EventHandler<TPayload, TPresence extends PresenceData> = {
  bivarianceHack(payload: TPayload, from: Peer<TPresence>): void;
}['bivarianceHack'];

interface ValueStore<T> {
  clear(): void;
  get(): T;
  publish(nextValue: T): void;
  subscribe(run: Subscriber<T>, invalidate?: Invalidator<T>): Unsubscriber;
}

interface PresenceSnapshotCache<TPresence extends PresenceData> {
  engine: PresenceEngine<TPresence>;
  room: Room<TPresence>;
  snapshot: PresenceStoreValue<TPresence>;
}

interface CursorSnapshotCache<TPresence extends PresenceData, TCursor extends CursorData> {
  engine: CursorEngine<TCursor>;
  room: Room<TPresence>;
  snapshot: CursorPosition<TCursor>[];
}

interface AwarenessSnapshotCache<TPresence extends PresenceData> {
  engine: AwarenessEngine;
  room: Room<TPresence>;
  snapshot: AwarenessStoreValue;
}

interface SharedStateSnapshotCache<TPresence extends PresenceData, T> {
  engine: StateEngine<T>;
  room: Room<TPresence>;
  snapshot: T;
}

interface SharedStateController<TPresence extends PresenceData, T> {
  binding: SharedStateBinding;
  cache: SharedStateSnapshotCache<TPresence, T> | null;
  cleanup: (() => void) | null;
  engine: StateEngine<T>;
  setter: (nextValue: SetStateAction<T>) => void;
  store: Writable<T>;
  tuple: readonly [Writable<T>, (nextValue: SetStateAction<T>) => void] | null;
  valueStore: ValueStore<T>;
}

interface EventListenerRecord<TPresence extends PresenceData> {
  active: boolean;
  cleanup: (() => void) | null;
  handler: (payload: unknown, from: Peer<TPresence>) => void;
  name: string;
}

interface EventChannelRecord<TPresence extends PresenceData> {
  cleanup: (() => void) | null;
  name: string;
  store: ValueStore<EventChannelValue<unknown, TPresence> | null>;
}

/**
 * Describes the value stored by the presence store.
 *
 * @typeParam TPresence - The room presence shape.
 */
export interface PresenceStoreValue<TPresence extends PresenceData = PresenceData> {
  /**
   * Exposes local and remote peers.
   */
  all: Peer<TPresence>[];

  /**
   * Exposes remote peers only.
   */
  others: Peer<TPresence>[];

  /**
   * Exposes the local peer snapshot.
   */
  self: Peer<TPresence>;
}

/**
 * Describes the value stored by the awareness store.
 */
export interface AwarenessStoreValue {
  /**
   * Exposes remote awareness state only.
   */
  others: AwarenessState[];
}

/**
 * Describes a custom event payload delivered through an event channel store.
 *
 * @typeParam TPayload - The event payload type.
 * @typeParam TPresence - The room presence shape.
 */
export interface EventChannelValue<
  TPayload = unknown,
  TPresence extends PresenceData = PresenceData,
> {
  /**
   * Exposes the sending peer.
   */
  from: Peer<TPresence>;

  /**
   * Exposes the event payload.
   */
  payload: TPayload;
}

/**
 * Readable presence store augmented with write helpers.
 *
 * @typeParam TPresence - The room presence shape.
 */
export interface PresenceStore<TPresence extends PresenceData = PresenceData> extends Readable<
  PresenceStoreValue<TPresence>
> {
  /**
   * Replaces the local presence payload.
   *
   * @param value - The presence payload to publish.
   * @returns Nothing.
   */
  replace(value: Partial<TPresence>): void;

  /**
   * Partially updates the local presence payload.
   *
   * @param value - The partial presence payload to merge.
   * @returns Nothing.
   */
  set(value: Partial<TPresence>): void;

  /**
   * Updates the local presence payload from the previous value.
   *
   * @param updater - The updater that returns the next partial presence payload.
   * @returns Nothing.
   */
  update(updater: Updater<Partial<TPresence>>): void;
}

/**
 * Readable cursor store augmented with DOM helpers.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 */
export interface CursorStore<TCursor extends CursorData = CursorData> extends Readable<
  CursorPosition<TCursor>[]
> {
  /**
   * Svelte action that mounts cursor tracking on an element.
   */
  mount: Action<HTMLElement, undefined>;

  /**
   * Renders remote cursors into the DOM.
   *
   * @param options - Optional cursor rendering overrides.
   * @returns Nothing.
   */
  render(options?: CursorRenderOptions): void;

  /**
   * Partially updates the local cursor payload.
   *
   * @param value - The partial cursor payload to publish.
   * @returns Nothing.
   */
  set(value: Partial<CursorPosition<TCursor>>): void;

  /**
   * Unmounts cursor tracking and rendering.
   *
   * @returns Nothing.
   */
  unmount(): void;

  /**
   * Updates the local cursor payload from the previous value.
   *
   * @param updater - The updater that returns the next partial cursor payload.
   * @returns Nothing.
   */
  update(updater: Updater<Partial<CursorPosition<TCursor>>>): void;
}

/**
 * Readable awareness store augmented with write helpers.
 */
export interface AwarenessStore extends Readable<AwarenessStoreValue> {
  /**
   * Merges arbitrary awareness metadata into the local peer.
   *
   * @param value - The awareness fields to merge.
   * @returns Nothing.
   */
  set(value: Record<string, unknown>): void;

  /**
   * Updates the local focus target.
   *
   * @param elementId - The focused element identifier, or `null` to clear it.
   * @returns Nothing.
   */
  setFocus(elementId: string | null): void;

  /**
   * Updates the local selection.
   *
   * @param selection - The active selection, or `null` to clear it.
   * @returns Nothing.
   */
  setSelection(selection: AwarenessSelection | null): void;

  /**
   * Updates the local typing state.
   *
   * @param isTyping - Whether the local peer is currently typing.
   * @returns Nothing.
   */
  setTyping(isTyping: boolean): void;

  /**
   * Updates awareness fields from the previous value.
   *
   * @param updater - The updater that returns the next awareness patch.
   * @returns Nothing.
   */
  update(updater: Updater<Record<string, unknown>>): void;
}

/**
 * Readable event channel store augmented with emit helpers.
 *
 * @typeParam TPayload - The event payload type.
 * @typeParam TPresence - The room presence shape.
 */
export interface EventChannelStore<
  TPayload = unknown,
  TPresence extends PresenceData = PresenceData,
> extends Readable<EventChannelValue<TPayload, TPresence> | null> {
  /**
   * Broadcasts an event on the bound channel.
   *
   * @param payload - The payload to send.
   * @returns Nothing.
   */
  emit(payload: TPayload): void;

  /**
   * Sends an event on the bound channel to a specific peer.
   *
   * @param peerId - The target peer identifier.
   * @param payload - The payload to send.
   * @returns Nothing.
   */
  emitTo(peerId: string, payload: TPayload): void;
}

/**
 * Exposes event helpers for the adapter.
 *
 * @typeParam TPresence - The room presence shape.
 */
export interface EventsNamespace<TPresence extends PresenceData = PresenceData> {
  /**
   * Creates a readable store for a custom event channel.
   *
   * @typeParam TPayload - The event payload type.
   * @param name - The custom event channel name.
   * @returns The bound event channel store.
   */
  channel<TPayload = unknown>(name: string): EventChannelStore<TPayload, TPresence>;

  /**
   * Broadcasts a custom event.
   *
   * @typeParam TPayload - The event payload type.
   * @param name - The custom event channel name.
   * @param payload - The payload to send.
   * @returns Nothing.
   */
  emit<TPayload = unknown>(name: string, payload: TPayload): void;

  /**
   * Sends a custom event to a specific peer.
   *
   * @typeParam TPayload - The event payload type.
   * @param peerId - The target peer identifier.
   * @param name - The custom event channel name.
   * @param payload - The payload to send.
   * @returns Nothing.
   */
  emitTo<TPayload = unknown>(peerId: string, name: string, payload: TPayload): void;

  /**
   * Subscribes to a custom event channel.
   *
   * @typeParam TPayload - The event payload type.
   * @param name - The custom event channel name.
   * @param handler - The callback invoked for incoming events.
   * @returns A function that removes the listener.
   */
  on<TPayload = unknown>(name: string, handler: EventHandler<TPayload, TPresence>): Unsubscribe;
}

/**
 * Exposes shared-state helpers for the adapter.
 */
export interface StateNamespace {
  /**
   * Creates or reuses a shared-state binding.
   *
   * @typeParam T - The shared state value type.
   * @param key - The logical binding key used to reuse the same shared-state engine.
   * @param options - The shared-state configuration, including `initialValue`.
   * @returns A Svelte writable store and setter pair.
   */
  shared<T>(
    key: string,
    options: StateOptions<T>,
  ): readonly [Writable<T>, (nextValue: SetStateAction<T>) => void];
}

/**
 * Configures the Svelte adapter.
 *
 * @typeParam TPresence - The room presence shape inferred from `presence`.
 */
export interface RoomfulOptions<
  TPresence extends PresenceData = PresenceData,
> extends RoomOptions<TPresence> {
  /**
   * Runs after the room connects.
   */
  onConnect?: () => void;

  /**
   * Runs after the room disconnects.
   */
  onDisconnect?: (payload: { reason?: string }) => void;

  /**
   * Runs when the room emits an operational error.
   */
  onError?: (error: RoomfulError) => void;
}

/**
 * Exposes the public Svelte adapter API.
 *
 * @typeParam TPresence - The room presence shape.
 * @typeParam TCursor - The custom cursor payload shape.
 */
export interface RoomfulAdapter<
  TPresence extends PresenceData = PresenceData,
  TCursor extends CursorData = CursorData,
> {
  /**
   * Exposes the awareness store.
   */
  awareness: AwarenessStore;

  /**
   * Connects the room runtime.
   *
   * @returns A promise that resolves when connection startup completes.
   */
  connect(): Promise<void>;

  /**
   * Exposes the cursor store.
   */
  cursors: CursorStore<TCursor>;

  /**
   * Tears down the adapter and room permanently.
   *
   * @returns A promise that resolves when teardown completes.
   */
  destroy(): Promise<void>;

  /**
   * Disconnects the room runtime.
   *
   * @returns A promise that resolves when disconnect teardown completes.
   */
  disconnect(): Promise<void>;

  /**
   * Exposes the event namespace.
   */
  events: EventsNamespace<TPresence>;

  /**
   * Exposes the presence store.
   */
  presence: PresenceStore<TPresence>;

  /**
   * Exposes the shared-state namespace.
   */
  state: StateNamespace;

  /**
   * Exposes the room connection status store.
   */
  status: Readable<RoomStatus>;
}

/**
 * Creates the Svelte adapter for a room.
 *
 * @typeParam TPresence - The room presence shape inferred from `options.presence`.
 * @typeParam TCursor - The custom cursor payload shape.
 * @param roomId - The room identifier to create or join.
 * @param options - Optional room and lifecycle configuration.
 * @returns The Svelte adapter.
 */
export function roomful<
  TPresence extends PresenceData = PresenceData,
  TCursor extends CursorData = CursorData,
>(roomId: string, options: RoomfulOptions<TPresence> = {}): RoomfulAdapter<TPresence, TCursor> {
  const { onConnect, onDisconnect, onError, ...roomOptions } = options;
  const room = createRoom(roomId, roomOptions);
  const presenceEngine = room.usePresence();
  const cursorEngine = room.useCursors<TCursor>();
  const awarenessEngine = room.useAwareness();
  const eventEngine = room.useEvents();

  let destroyed = false;
  let mounted = false;
  let runtimeStarted = false;
  let trackedCursorElement: HTMLElement | null = null;
  let localCursorValue: Partial<CursorPosition<TCursor>> = {};
  let presenceCache: PresenceSnapshotCache<TPresence> | null = null;
  let cursorCache: CursorSnapshotCache<TPresence, TCursor> | null = null;
  let awarenessCache: AwarenessSnapshotCache<TPresence> | null = null;
  let sharedStateController: SharedStateController<TPresence, unknown> | null = null;

  const cleanupRegistry = new Set<() => void>();
  const eventListeners = new Set<EventListenerRecord<TPresence>>();
  const eventChannels = new Map<string, EventChannelRecord<TPresence>>();

  const assertAvailable = (methodName: string): void => {
    if (!destroyed) {
      return;
    }

    throw new RoomfulError('INVALID_STATE', `Cannot call ${methodName}() after destroy().`, false);
  };

  const presenceStore = createValueStore(
    readPresenceSnapshot(room, presenceEngine, {
      current: presenceCache,
      set(nextCache) {
        presenceCache = nextCache;
      },
    }),
  );
  const cursorStore = createValueStore(
    readCursorSnapshot(room, cursorEngine, {
      current: cursorCache,
      set(nextCache) {
        cursorCache = nextCache;
      },
    }),
  );
  const awarenessStore = createValueStore(
    readAwarenessSnapshot(room, awarenessEngine, {
      current: awarenessCache,
      set(nextCache) {
        awarenessCache = nextCache;
      },
    }),
  );
  const statusStore = createValueStore<RoomStatus>(room.status);

  const refreshStatus = (): void => {
    statusStore.publish(room.status);
  };

  const refreshPresence = (): void => {
    presenceStore.publish(
      readPresenceSnapshot(room, presenceEngine, {
        current: presenceCache,
        set(nextCache) {
          presenceCache = nextCache;
        },
      }),
    );
  };

  const refreshCursors = (): void => {
    cursorStore.publish(
      readCursorSnapshot(room, cursorEngine, {
        current: cursorCache,
        set(nextCache) {
          cursorCache = nextCache;
        },
      }),
    );
  };

  const refreshAwareness = (): void => {
    awarenessStore.publish(
      readAwarenessSnapshot(room, awarenessEngine, {
        current: awarenessCache,
        set(nextCache) {
          awarenessCache = nextCache;
        },
      }),
    );
  };

  const registerCleanup = (callback: () => void): (() => void) => {
    let active = true;
    const cleanup = (): void => {
      if (!active) {
        return;
      }

      active = false;
      cleanupRegistry.delete(cleanup);
      callback();
    };

    cleanupRegistry.add(cleanup);
    return cleanup;
  };

  const unsubscribeConnected = room.on('connected', () => {
    refreshStatus();
    onConnect?.();
  });
  const unsubscribeReconnecting = room.on('reconnecting', () => {
    refreshStatus();
  });
  const unsubscribeDisconnected = room.on('disconnected', (payload) => {
    refreshStatus();
    onDisconnect?.(payload);
  });
  const unsubscribeError = room.on('error', (error) => {
    refreshStatus();
    onError?.(error);
  });

  registerCleanup(() => {
    unsubscribeError();
    unsubscribeDisconnected();
    unsubscribeReconnecting();
    unsubscribeConnected();
  });

  const attachPresenceSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = presenceEngine.subscribe(() => {
      refreshPresence();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachCursorSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = cursorEngine.subscribe(() => {
      refreshCursors();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachAwarenessSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = awarenessEngine.subscribe(() => {
      refreshAwareness();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachSharedStateSubscription = (): void => {
    if (!runtimeStarted || !sharedStateController || sharedStateController.cleanup) {
      return;
    }

    const controller = sharedStateController;
    const unsubscribe = controller.engine.subscribe(() => {
      refreshSharedState(room, controller);
    });

    controller.cleanup = registerCleanup(() => {
      unsubscribe();
      if (controller.cleanup) {
        controller.cleanup = null;
      }
    });
  };

  const attachEventListener = (record: EventListenerRecord<TPresence>): void => {
    if (!runtimeStarted || !record.active || record.cleanup) {
      return;
    }

    const unsubscribe = eventEngine.on(record.name, record.handler);
    record.cleanup = registerCleanup(() => {
      unsubscribe();
      if (record.cleanup) {
        record.cleanup = null;
      }
    });
  };

  const attachEventChannel = (record: EventChannelRecord<TPresence>): void => {
    if (!runtimeStarted || record.cleanup) {
      return;
    }

    const unsubscribe = eventEngine.on(record.name, (payload, from) => {
      record.store.publish({
        from,
        payload,
      });
    });

    record.cleanup = registerCleanup(() => {
      unsubscribe();
      if (record.cleanup) {
        record.cleanup = null;
      }
    });
  };

  const ensureRuntimeStarted = (): void => {
    if (runtimeStarted) {
      return;
    }

    assertAvailable('connect');
    runtimeStarted = true;

    attachPresenceSubscription();
    attachCursorSubscription();
    attachAwarenessSubscription();
    attachSharedStateSubscription();

    for (const record of eventListeners) {
      attachEventListener(record);
    }

    for (const record of eventChannels.values()) {
      attachEventChannel(record);
    }
  };

  const unmountTrackedCursor = (): void => {
    if (!trackedCursorElement) {
      return;
    }

    cursorEngine.unmount();
    trackedCursorElement = null;
  };

  const mountCursor = (element: HTMLElement): void => {
    assertAvailable('cursors.mount');

    if (trackedCursorElement === element) {
      return;
    }

    if (trackedCursorElement) {
      cursorEngine.unmount();
    }

    trackedCursorElement = element;
    cursorEngine.mount(element);
  };

  const presence: PresenceStore<TPresence> = {
    subscribe(run, invalidate) {
      return presenceStore.subscribe(run, invalidate);
    },
    replace(value) {
      assertAvailable('presence.replace');

      const nextValue = sanitizePresenceInput(value);
      if (
        areStructuredValuesEqual(readPresenceWritableValue(presenceStore.get().self), nextValue)
      ) {
        return;
      }

      presenceEngine.replace(nextValue);
      refreshPresence();
    },
    set(value) {
      presence.replace(value);
    },
    update(updater) {
      assertAvailable('presence.update');

      const currentValue = readPresenceWritableValue(presenceStore.get().self);
      const nextValue = sanitizePresenceInput(updater(currentValue));
      if (areStructuredValuesEqual(currentValue, nextValue)) {
        return;
      }

      presenceEngine.replace(nextValue);
      refreshPresence();
    },
  };

  const cursors: CursorStore<TCursor> = {
    subscribe(run, invalidate) {
      return cursorStore.subscribe(run, invalidate);
    },
    mount(node) {
      mountCursor(node);

      return {
        destroy() {
          if (trackedCursorElement === node) {
            unmountTrackedCursor();
          }
        },
      };
    },
    render(renderOptions) {
      assertAvailable('cursors.render');
      cursorEngine.render(renderOptions);
    },
    set(value) {
      assertAvailable('cursors.set');

      if (areStructuredValuesEqual(localCursorValue, value)) {
        return;
      }

      localCursorValue = cloneStructuredValue(value);
      cursorEngine.setPosition(value);
    },
    unmount() {
      unmountTrackedCursor();
    },
    update(updater) {
      assertAvailable('cursors.update');

      const nextValue = updater(cloneStructuredValue(localCursorValue));
      if (areStructuredValuesEqual(localCursorValue, nextValue)) {
        return;
      }

      localCursorValue = cloneStructuredValue(nextValue);
      cursorEngine.setPosition(nextValue);
    },
  };

  const awareness: AwarenessStore = {
    subscribe(run, invalidate) {
      return awarenessStore.subscribe(run, invalidate);
    },
    set(value) {
      assertAvailable('awareness.set');

      const currentValue = readAwarenessWritableValue(room, awarenessEngine);
      if (areStructuredValuesEqual(currentValue, value)) {
        return;
      }

      awarenessEngine.set(value);
    },
    setFocus(elementId) {
      assertAvailable('awareness.setFocus');
      awarenessEngine.setFocus(elementId);
    },
    setSelection(selection) {
      assertAvailable('awareness.setSelection');
      awarenessEngine.setSelection(selection);
    },
    setTyping(isTyping) {
      assertAvailable('awareness.setTyping');
      awarenessEngine.setTyping(isTyping);
    },
    update(updater) {
      assertAvailable('awareness.update');

      const currentValue = readAwarenessWritableValue(room, awarenessEngine);
      const nextValue = updater(currentValue);
      if (areStructuredValuesEqual(currentValue, nextValue)) {
        return;
      }

      awarenessEngine.set(nextValue);
    },
  };

  const state: StateNamespace = {
    shared<T>(
      key: string,
      options: StateOptions<T>,
    ): readonly [Writable<T>, (nextValue: SetStateAction<T>) => void] {
      assertAvailable('state.shared');

      const stateOptions: StateOptions<T> = options;

      if (sharedStateController) {
        assertCompatibleSharedStateBinding(sharedStateController.binding, key, stateOptions, {
          method: 'state.shared',
          container: 'adapter',
        });

        if (
          sharedStateController.binding.persist !== true &&
          options.persist === true &&
          sharedStateController.binding.strategy === 'lww'
        ) {
          room.useState(stateOptions);
          sharedStateController.binding.persist = true;
        }

        const currentTuple = sharedStateController.tuple;
        if (!currentTuple) {
          throw new RoomfulError('INVALID_STATE', 'Shared state tuple was not initialized.', false);
        }

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return currentTuple as readonly [Writable<T>, (nextValue: SetStateAction<T>) => void];
      }

      const binding = createSharedStateBinding(key, stateOptions);
      const engine = room.useState(stateOptions);
      const valueStore = createValueStore(
        readSharedStateSnapshot(room, engine, {
          current: null,
          set() {
            return undefined;
          },
        }),
      );
      const controller: SharedStateController<TPresence, T> = {
        binding,
        cache: null,
        cleanup: null,
        engine,
        setter(nextValue) {
          assertAvailable('state.shared.set');

          const currentValue = valueStore.get();
          const resolvedValue = isStateUpdater(nextValue) ? nextValue(currentValue) : nextValue;
          if (areStructuredValuesEqual(currentValue, resolvedValue)) {
            return;
          }

          engine.set(resolvedValue);
          refreshSharedState(room, controller);
        },
        store: {
          subscribe(run, invalidate) {
            return valueStore.subscribe(run, invalidate);
          },
          set(nextValue: T) {
            controller.setter(nextValue);
          },
          update(updater: Updater<T>) {
            controller.setter(updater(valueStore.get()));
          },
        },
        tuple: null,
        valueStore,
      };

      const tuple: readonly [Writable<T>, (nextValue: SetStateAction<T>) => void] = [
        controller.store,
        controller.setter,
      ];
      controller.tuple = tuple;
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      sharedStateController = controller as SharedStateController<TPresence, unknown>;
      if (runtimeStarted) {
        attachSharedStateSubscription();
      }

      return tuple;
    },
  };

  const events: EventsNamespace<TPresence> = {
    channel<TPayload = unknown>(name: string): EventChannelStore<TPayload, TPresence> {
      assertAvailable('events.channel');

      const existingRecord = eventChannels.get(name);
      if (existingRecord) {
        return createEventChannelStore<TPayload, TPresence>(
          name,
          existingRecord.store,
          eventEngine,
        );
      }

      const record: EventChannelRecord<TPresence> = {
        cleanup: null,
        name,
        store: createValueStore<EventChannelValue<unknown, TPresence> | null>(null),
      };

      eventChannels.set(name, record);
      if (runtimeStarted) {
        attachEventChannel(record);
      }

      return createEventChannelStore<TPayload, TPresence>(name, record.store, eventEngine);
    },
    emit(name, payload) {
      assertAvailable('events.emit');
      eventEngine.emit(name, payload);
    },
    emitTo(peerId, name, payload) {
      assertAvailable('events.emitTo');
      eventEngine.emitTo(peerId, name, payload);
    },
    on<TPayload = unknown>(name: string, handler: EventHandler<TPayload, TPresence>): Unsubscribe {
      assertAvailable('events.on');

      const record: EventListenerRecord<TPresence> = {
        active: true,
        cleanup: null,
        handler(payload, from) {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          handler(payload as TPayload, from);
        },
        name,
      };

      eventListeners.add(record);
      if (runtimeStarted) {
        attachEventListener(record);
      }

      return () => {
        if (!record.active) {
          return;
        }

        record.active = false;
        eventListeners.delete(record);
        record.cleanup?.();
        record.cleanup = null;
      };
    },
  };

  try {
    onMount(() => {
      mounted = true;
      void connect().catch(() => {
        return undefined;
      });
    });
    onDestroy(() => {
      if (!mounted) {
        return;
      }

      void destroy().catch(() => {
        return undefined;
      });
    });
  } catch {
    // The adapter supports non-component usage by falling back to manual lifecycle control.
  }

  async function connect(): Promise<void> {
    assertAvailable('connect');
    ensureRuntimeStarted();
    await room.connect();
  }

  async function disconnect(): Promise<void> {
    assertAvailable('disconnect');
    await room.disconnect();
  }

  async function destroy(): Promise<void> {
    if (destroyed) {
      return;
    }

    destroyed = true;

    const cleanups = Array.from(cleanupRegistry);
    cleanupRegistry.clear();

    for (const cleanup of cleanups) {
      cleanup();
    }

    unmountTrackedCursor();
    eventListeners.clear();
    for (const record of eventChannels.values()) {
      record.store.clear();
    }
    eventChannels.clear();
    presenceStore.clear();
    cursorStore.clear();
    awarenessStore.clear();
    statusStore.clear();
    sharedStateController?.valueStore.clear();

    await room.disconnect().catch(() => {
      return undefined;
    });
  }

  const status: Readable<RoomStatus> = {
    subscribe(run, invalidate) {
      return statusStore.subscribe(run, invalidate);
    },
  };

  return {
    awareness,
    connect,
    cursors,
    destroy,
    disconnect,
    events,
    presence,
    state,
    status,
  };
}

function createValueStore<T>(initialValue: T): ValueStore<T> {
  let currentValue = initialValue;
  const subscribers = new Set<Subscriber<T>>();

  return {
    clear() {
      subscribers.clear();
    },
    get() {
      return currentValue;
    },
    publish(nextValue) {
      if (Object.is(currentValue, nextValue)) {
        return;
      }

      currentValue = nextValue;

      for (const subscriber of subscribers) {
        subscriber(currentValue);
      }
    },
    subscribe(run) {
      run(currentValue);
      subscribers.add(run);

      return () => {
        subscribers.delete(run);
      };
    },
  };
}

function createEventChannelStore<TPayload, TPresence extends PresenceData>(
  name: string,
  store: ValueStore<EventChannelValue<unknown, TPresence> | null>,
  eventEngine: EventEngine<TPresence>,
): EventChannelStore<TPayload, TPresence> {
  return {
    emit(payload) {
      eventEngine.emit(name, payload);
    },
    emitTo(peerId, payload) {
      eventEngine.emitTo(peerId, name, payload);
    },
    subscribe(run) {
      return store.subscribe((value) => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        run(value as EventChannelValue<TPayload, TPresence> | null);
      });
    },
  };
}

function refreshSharedState<TPresence extends PresenceData, T>(
  room: Room<TPresence>,
  controller: SharedStateController<TPresence, T>,
): void {
  const nextSnapshot = readSharedStateSnapshot(room, controller.engine, {
    current: controller.cache,
    set(nextCache) {
      controller.cache = nextCache;
    },
  });

  controller.valueStore.publish(nextSnapshot);
}

function readPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: {
    current: PresenceSnapshotCache<TPresence> | null;
    set(nextCache: PresenceSnapshotCache<TPresence>): void;
  },
): PresenceStoreValue<TPresence> {
  const all = presence.getAll();
  const self = readSelfPeer(room, presence, all);
  const others = all.filter((peer) => {
    return peer.id !== room.peerId;
  });
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === presence) {
    const previousSnapshot = previous.snapshot;
    const isAllEqual = arePeerArraysEqual(previousSnapshot.all, all);
    const isSelfEqual = arePeersEqual(previousSnapshot.self, self);
    const isOthersEqual = arePeerArraysEqual(previousSnapshot.others, others);

    if (isAllEqual && isSelfEqual && isOthersEqual) {
      return previousSnapshot;
    }

    const nextSnapshot: PresenceStoreValue<TPresence> = {
      all: isAllEqual ? previousSnapshot.all : all,
      others: isOthersEqual ? previousSnapshot.others : others,
      self: isSelfEqual ? previousSnapshot.self : self,
    };

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  const snapshot: PresenceStoreValue<TPresence> = {
    all,
    others,
    self,
  };

  cacheRef.set({
    engine: presence,
    room,
    snapshot,
  });

  return snapshot;
}

function readCursorSnapshot<TPresence extends PresenceData, TCursor extends CursorData>(
  room: Room<TPresence>,
  cursors: CursorEngine<TCursor>,
  cacheRef: {
    current: CursorSnapshotCache<TPresence, TCursor> | null;
    set(nextCache: CursorSnapshotCache<TPresence, TCursor>): void;
  },
): CursorPosition<TCursor>[] {
  const nextSnapshot = cursors.getPositions();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === cursors) {
    const previousSnapshot = previous.snapshot;
    if (areCursorArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((position, index) => {
      const previousPosition = previousSnapshot[index];
      if (previousPosition && areCursorPositionsEqual(previousPosition, position)) {
        return previousPosition;
      }

      return position;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: cursors,
    room,
    snapshot: nextSnapshot,
  });
  return nextSnapshot;
}

function readAwarenessSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  awareness: AwarenessEngine,
  cacheRef: {
    current: AwarenessSnapshotCache<TPresence> | null;
    set(nextCache: AwarenessSnapshotCache<TPresence>): void;
  },
): AwarenessStoreValue {
  const nextOthers = awareness.getAll().filter((entry) => {
    return entry.peerId !== room.peerId;
  });
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === awareness) {
    const previousSnapshot = previous.snapshot;
    if (areAwarenessArraysEqual(previousSnapshot.others, nextOthers)) {
      return previousSnapshot;
    }

    const stableOthers = nextOthers.map((entry, index) => {
      const previousEntry = previousSnapshot.others[index];
      if (previousEntry && areStructuredValuesEqual(previousEntry, entry)) {
        return previousEntry;
      }

      return entry;
    });
    previous.snapshot = {
      others: stableOthers,
    };
    return previous.snapshot;
  }

  const snapshot: AwarenessStoreValue = {
    others: nextOthers,
  };

  cacheRef.set({
    engine: awareness,
    room,
    snapshot,
  });

  return snapshot;
}

function readSharedStateSnapshot<TPresence extends PresenceData, T>(
  room: Room<TPresence>,
  state: StateEngine<T>,
  cacheRef: {
    current: SharedStateSnapshotCache<TPresence, T> | null;
    set(nextCache: SharedStateSnapshotCache<TPresence, T>): void;
  },
): T {
  const nextSnapshot = state.get();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === state) {
    if (areStructuredValuesEqual(previous.snapshot, nextSnapshot)) {
      return previous.snapshot;
    }

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  cacheRef.set({
    engine: state,
    room,
    snapshot: nextSnapshot,
  });

  return nextSnapshot;
}

function readPresenceWritableValue<TPresence extends PresenceData>(
  peer: Peer<TPresence>,
): Partial<TPresence> {
  const result: Partial<TPresence> = {};

  for (const [key, value] of Object.entries(peer)) {
    if (LOCKED_PRESENCE_KEYS.has(key)) {
      continue;
    }

    Reflect.set(result, key, value);
  }

  return result;
}

function readAwarenessWritableValue<TPresence extends PresenceData>(
  room: Room<TPresence>,
  awareness: AwarenessEngine,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const selfAwareness = awareness.getAll().find((entry) => {
    return entry.peerId === room.peerId;
  }) ?? { peerId: room.peerId };

  for (const [key, value] of Object.entries(selfAwareness)) {
    if (key === 'peerId') {
      continue;
    }

    Reflect.set(result, key, value);
  }

  return result;
}

function sanitizePresenceInput<TPresence extends PresenceData>(
  value: Partial<TPresence>,
): Partial<TPresence> {
  const result: Partial<TPresence> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (LOCKED_PRESENCE_KEYS.has(key)) {
      continue;
    }

    Reflect.set(result, key, entry);
  }

  return result;
}

function isStateUpdater<T>(value: SetStateAction<T>): value is (current: T) => T {
  return typeof value === 'function';
}
