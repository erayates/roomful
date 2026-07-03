import type {
  ActivityEngine,
  ActivityEntry,
  ActivityOptions,
  AwarenessEngine,
  AwarenessState,
  Comment,
  CommentAnchor,
  CommentsEngine,
  CommentsOptions,
  CommentThread,
  CursorData,
  CursorEngine,
  CursorOptions,
  CursorPosition,
  HistoryEngine,
  HistoryOptions,
  LockAcquireOptions,
  LockEngine,
  LockState,
  Peer,
  PointerBeam,
  PointerEngine,
  PointerOptions,
  PresenceData,
  PresenceEngine,
  RecordingEngine,
  RecordingState,
  Room,
  RoomfulRecording,
  RoomOptions,
  RoomStatus,
  StateEngine,
  StateOptions,
  TimelineEntry,
  ViewportEngine,
  ViewportOptions,
  ViewportState,
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
  createSharedStateBinding,
  isObjectLike,
  readSelfPeer,
  type SharedStateBinding,
} from '@roomful/core/adapter-runtime';
import type { Directive, InjectionKey, ObjectDirective, Plugin, ShallowRef } from 'vue';
import { getCurrentInstance, inject, markRaw, shallowRef, watch } from 'vue';

/**
 * Configures the Vue plugin.
 *
 * @typeParam TPresence - The room presence shape inferred from `presence`.
 */
export interface RoomfulPluginOptions<
  TPresence extends PresenceData = PresenceData,
> extends RoomOptions<TPresence> {
  /**
   * Identifies the room to create or join.
   */
  roomId: string;

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
 * Wraps a Vue `ShallowRef` in a readonly view for consumers.
 *
 * @typeParam T - The referenced value type.
 */
export type ReadonlyRef<T> = Readonly<ShallowRef<T>>;

/**
 * Describes the return value of `usePresence`.
 *
 * @typeParam TPresence - The room presence shape.
 */
export interface UsePresenceResult<TPresence extends PresenceData = PresenceData> {
  /**
   * Exposes the local peer snapshot.
   */
  self: ReadonlyRef<Peer<TPresence>>;

  /**
   * Exposes remote peers only.
   */
  others: ReadonlyRef<Peer<TPresence>[]>;

  /**
   * Exposes local and remote peers.
   */
  all: ReadonlyRef<Peer<TPresence>[]>;

  /**
   * Partially updates the local presence payload.
   */
  update: PresenceEngine<TPresence>['update'];

  /**
   * Replaces the local presence payload.
   */
  replace: PresenceEngine<TPresence>['replace'];
}

/**
 * Describes the return value of `useCursors`.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 */
export interface UseCursorsResult<TCursor extends CursorData = CursorData> {
  /**
   * Holds the mounted cursor host element.
   */
  ref: ShallowRef<HTMLElement | null>;

  /**
   * Exposes the latest cursor positions.
   */
  cursors: ReadonlyRef<CursorPosition<TCursor>[]>;

  /**
   * Mounts cursor tracking on an element.
   *
   * @param element - The element to observe.
   * @returns Nothing.
   */
  mount(element: HTMLElement): void;

  /**
   * Unmounts cursor tracking.
   *
   * @returns Nothing.
   */
  unmount(): void;
}

/**
 * Describes the return value of `useViewport`.
 */
export interface UseViewportResult {
  /**
   * Holds the mounted viewport host element.
   */
  ref: ShallowRef<HTMLElement | null>;

  /**
   * Exposes remote peer viewport states only.
   */
  states: ReadonlyRef<ViewportState[]>;

  /**
   * Mounts viewport tracking on a scrollable container.
   *
   * @param element - The element to observe.
   * @returns Nothing.
   */
  mount(element: HTMLElement): void;

  /**
   * Unmounts viewport tracking.
   *
   * @returns Nothing.
   */
  unmount(): void;

  /**
   * Starts streaming the local viewport to all peers.
   */
  broadcast: ViewportEngine['broadcast'];

  /**
   * Stops streaming the local viewport.
   */
  stopBroadcast: ViewportEngine['stopBroadcast'];

  /**
   * Enters present mode, forcing peers to follow the local viewport.
   */
  present: ViewportEngine['present'];

  /**
   * Leaves present mode and releases following peers.
   */
  stopPresenting: ViewportEngine['stopPresenting'];

  /**
   * Follows a specific peer's viewport.
   */
  follow: ViewportEngine['follow'];

  /**
   * Stops following any peer and resumes independent scrolling.
   */
  unfollow: ViewportEngine['unfollow'];
}

/**
 * Describes the return value of `usePointer`.
 */
export interface UsePointerResult {
  /**
   * Holds the mounted pointer host element.
   */
  ref: ShallowRef<HTMLElement | null>;

  /**
   * Exposes remote peers' pointer beams only.
   */
  beams: ReadonlyRef<PointerBeam[]>;

  /**
   * Mounts pointer tracking on a container element.
   *
   * @param element - The element to observe.
   * @returns Nothing.
   */
  mount(element: HTMLElement): void;

  /**
   * Unmounts pointer tracking.
   *
   * @returns Nothing.
   */
  unmount(): void;

  /**
   * Starts broadcasting the local pointer beam to all peers.
   */
  activate: PointerEngine['activate'];

  /**
   * Stops broadcasting the local pointer beam so peers drop it.
   */
  deactivate: PointerEngine['deactivate'];

  /**
   * Renders the built-in pointer overlay over a container, returning a cleanup
   * function.
   */
  render: PointerEngine['render'];
}

/**
 * Describes the return value of `useAwareness`.
 */
export interface UseAwarenessResult {
  /**
   * Exposes remote awareness state only.
   */
  others: ReadonlyRef<AwarenessState[]>;

  /**
   * Merges arbitrary awareness metadata into the local peer.
   */
  set: AwarenessEngine['set'];

  /**
   * Updates the local focus target.
   */
  setFocus: AwarenessEngine['setFocus'];

  /**
   * Updates the local selection.
   */
  setSelection: AwarenessEngine['setSelection'];

  /**
   * Updates the local typing state.
   */
  setTyping: AwarenessEngine['setTyping'];
}

/**
 * Describes the return value of `useLocks`.
 */
export interface UseLocksResult {
  /**
   * Exposes the resolved state of every currently-held lock.
   */
  locks: ReadonlyRef<LockState[]>;

  /**
   * Claims exclusive ownership of a key, resolving whether the local peer holds
   * it.
   *
   * @param key - The lock key to claim.
   * @param options - Optional TTL and acquire-timeout configuration.
   * @returns A promise resolving to whether the local peer holds the key.
   */
  acquire(key: string, options?: LockAcquireOptions): Promise<boolean>;

  /**
   * Releases a lock held by the local peer.
   */
  release: LockEngine['release'];

  /**
   * Releases every lock held by the local peer.
   */
  releaseAll: LockEngine['releaseAll'];

  /**
   * Reports whether a key is currently held by any peer.
   */
  isLocked: LockEngine['isLocked'];

  /**
   * Returns the peer currently holding a key, or `null`.
   */
  getHolder: LockEngine['getHolder'];
}

/**
 * Describes the return value of `useComments`.
 */
export interface UseCommentsResult {
  /**
   * Exposes the current comment threads, oldest first. Reactive: updates on any
   * local or remote thread change.
   */
  threads: ReadonlyRef<CommentThread[]>;

  /**
   * Opens a new thread authored by the local peer at an anchor.
   */
  add: CommentsEngine['add'];

  /**
   * Appends a reply authored by the local peer to a thread.
   *
   * @param threadId - The thread to reply to.
   * @param text - The reply body.
   * @returns A promise resolving to the updated thread.
   */
  reply(threadId: string, text: string): Promise<CommentThread>;

  /**
   * Marks a thread resolved.
   *
   * @param threadId - The thread to resolve.
   * @returns A promise resolving to the updated thread.
   */
  resolve(threadId: string): Promise<CommentThread>;

  /**
   * Reopens a resolved thread.
   *
   * @param threadId - The thread to reopen.
   * @returns A promise resolving to the updated thread.
   */
  reopen(threadId: string): Promise<CommentThread>;

  /**
   * Returns the threads anchored to an element.
   */
  getByElement: CommentsEngine['getByElement'];

  /**
   * Returns the unresolved threads.
   */
  getOpen: CommentsEngine['getOpen'];
}

/**
 * Describes the return value of `useActivity`.
 */
export interface UseActivityResult {
  /**
   * Exposes the current activity feed, newest first. Reactive: updates on any
   * local or remote entry.
   */
  entries: ReadonlyRef<ActivityEntry[]>;

  /**
   * Records a new activity entry authored by the local peer and broadcasts it.
   */
  record: ActivityEngine['record'];
}

/**
 * Describes the return value of `useHistory`.
 */
export interface UseHistoryResult {
  /**
   * Exposes the shared timeline of every peer's entries, oldest first. Reactive:
   * updates on any local or remote timeline change.
   */
  timeline: ReadonlyRef<TimelineEntry[]>;

  /**
   * Reports whether the local peer has a tracked transaction to undo. Reactive.
   */
  canUndo: ReadonlyRef<boolean>;

  /**
   * Reports whether the local peer has an undone transaction to redo. Reactive.
   */
  canRedo: ReadonlyRef<boolean>;

  /**
   * Records a timeline entry without wrapping a mutation.
   */
  capture: HistoryEngine['capture'];

  /**
   * Runs a function, capturing its shared-CRDT mutations as one undoable entry.
   */
  transaction: HistoryEngine['transaction'];

  /**
   * Undoes the local peer's most recent tracked transaction.
   */
  undo: HistoryEngine['undo'];

  /**
   * Redoes the local peer's most recently undone transaction.
   */
  redo: HistoryEngine['redo'];
}

/**
 * Describes the return value of `useRecording`.
 */
export interface UseRecordingResult {
  /**
   * Reports whether a recording is currently capturing frames. Reactive.
   */
  isRecording: ReadonlyRef<boolean>;

  /**
   * Reports how many frames the active recording has captured. Reactive.
   */
  frameCount: ReadonlyRef<number>;

  /**
   * Reports the elapsed duration of the active recording in milliseconds.
   * Reactive.
   */
  durationMs: ReadonlyRef<number>;

  /**
   * Begins capturing room activity into a new recording.
   */
  start: RecordingEngine['start'];

  /**
   * Stops the active recording.
   */
  stop: RecordingEngine['stop'];

  /**
   * Replays a recording, defaulting to the most recent capture.
   */
  replay: RecordingEngine['replay'];

  /**
   * Exports the captured recording as a serializable payload.
   */
  exportRecording: RecordingEngine['export'];
}

/**
 * Re-exports the collaborative comment types for adapter consumers.
 */
export type { Comment, CommentAnchor, CommentsOptions, CommentThread };

/**
 * Re-exports the collaborative activity types for adapter consumers.
 */
export type { ActivityEngine, ActivityEntry, ActivityOptions };

/**
 * Re-exports the collaborative history types for adapter consumers.
 */
export type { HistoryEngine, HistoryOptions, TimelineEntry };

/**
 * Re-exports the session recording types for adapter consumers.
 */
export type { RecordingEngine, RecordingState, RoomfulRecording };

/**
 * Mirrors React-style updater semantics for Vue shared state setters.
 *
 * @typeParam T - The shared state value type.
 */
export type SharedStateUpdater<T> = T | ((previous: T) => T);

/**
 * Updates a shared state binding.
 *
 * @typeParam T - The shared state value type.
 * @param nextValue - The next value or updater function.
 * @returns Nothing.
 */
export type SharedStateSetter<T> = (nextValue: SharedStateUpdater<T>) => void;

/**
 * Vue directive type used by `v-roomful-cursors`.
 */
export type RoomfulCursorsDirective = Directive<HTMLElement, CursorOptions | undefined>;

interface RoomfulPluginContext {
  room: ShallowRef<Room<PresenceData>>;
}

interface PresenceSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: {
    self: Peer<TPresence>;
    others: Peer<TPresence>[];
    all: Peer<TPresence>[];
  };
}

interface CursorSnapshotCache<TPresence extends PresenceData, TCursor extends CursorData> {
  room: Room<TPresence>;
  engine: CursorEngine<TCursor>;
  snapshot: CursorPosition<TCursor>[];
}

interface AwarenessSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: AwarenessEngine;
  snapshot: AwarenessState[];
}

interface ViewportSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: ViewportEngine;
  snapshot: ViewportState[];
}

interface PointerSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PointerEngine;
  snapshot: PointerBeam[];
}

interface LocksSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: LockEngine;
  snapshot: LockState[];
}

interface LockStateSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: LockEngine;
  key: string;
  snapshot: LockState | null;
}

interface SharedStateSnapshotCache<TPresence extends PresenceData, T> {
  room: Room<TPresence>;
  engine: StateEngine<T>;
  snapshot: T;
}

interface CommentsSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: CommentsEngine;
  snapshot: CommentThread[];
}

interface ActivitySnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: ActivityEngine;
  snapshot: ActivityEntry[];
}

interface HistorySnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: HistoryEngine;
  snapshot: TimelineEntry[];
}

interface MountedCursorDirectiveState {
  room: Room<PresenceData>;
  engine: CursorEngine<CursorData>;
  options: CursorOptions | undefined;
}

type EventHandlerRef<TPayload, TPresence extends PresenceData> = {
  bivarianceHack(payload: TPayload, from: Peer<TPresence>): void;
}['bivarianceHack'];

const ROOMFUL_CONTEXT_KEY: InjectionKey<RoomfulPluginContext> = Symbol('RoomfulPluginContext');
const sharedStateBindings = new WeakMap<Room<PresenceData>, SharedStateBinding>();

/**
 * Installs the Roomful Vue plugin and cursor directive.
 */
export const RoomfulPlugin: Plugin<RoomfulPluginOptions<PresenceData>> = {
  install(app, rawOptions) {
    if (!isRoomfulPluginOptions(rawOptions)) {
      throw new RoomfulError(
        'INVALID_STATE',
        'RoomfulPlugin requires app.use(RoomfulPlugin, { roomId, ...options }).',
        false,
      );
    }

    const room = markRaw(createRoom(rawOptions.roomId, createRoomOptions(rawOptions)));
    const context: RoomfulPluginContext = {
      room: shallowRef(room),
    };
    const directiveStates = new Map<HTMLElement, MountedCursorDirectiveState>();

    app.provide(ROOMFUL_CONTEXT_KEY, context);
    app.directive('roomful-cursors', createRoomfulCursorsDirective(context, directiveStates));

    const unsubscribeConnected = room.on('connected', () => {
      rawOptions.onConnect?.();
    });
    const unsubscribeDisconnected = room.on('disconnected', (payload) => {
      rawOptions.onDisconnect?.(payload);
    });
    const unsubscribeError = room.on('error', (error) => {
      rawOptions.onError?.(error);
    });

    void room.connect().catch(() => {
      return undefined;
    });

    const originalUnmount = app.unmount.bind(app);
    let isCleanedUp = false;

    const cleanup = (): void => {
      if (isCleanedUp) {
        return;
      }

      isCleanedUp = true;

      unsubscribeError();
      unsubscribeDisconnected();
      unsubscribeConnected();

      for (const state of directiveStates.values()) {
        state.engine.unmount();
      }
      directiveStates.clear();
      sharedStateBindings.delete(room);

      void room.disconnect().catch(() => {
        return undefined;
      });
    };

    app.unmount = (...args) => {
      try {
        return originalUnmount(...args);
      } finally {
        cleanup();
      }
    };
  },
};

/**
 * Subscribes to room presence snapshots.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The local peer, remote peers, and presence mutators.
 */
export function usePresence<
  TPresence extends PresenceData = PresenceData,
>(): UsePresenceResult<TPresence> {
  const context = useRoomfulContext('usePresence');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'usePresence');
  const cacheRef: { current: PresenceSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const initialSnapshot = readPresenceSnapshot(initialRoom, initialRoom.usePresence(), cacheRef);
  const self = shallowRef(initialSnapshot.self);
  const others = shallowRef(initialSnapshot.others);
  const all = shallowRef(initialSnapshot.all);

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'usePresence');
      const presence = typedRoom.usePresence();
      const syncSnapshot = (): void => {
        const nextSnapshot = readPresenceSnapshot(typedRoom, presence, cacheRef);
        if (
          self.value === nextSnapshot.self &&
          others.value === nextSnapshot.others &&
          all.value === nextSnapshot.all
        ) {
          return;
        }

        self.value = nextSnapshot.self;
        others.value = nextSnapshot.others;
        all.value = nextSnapshot.all;
      };

      syncSnapshot();

      const unsubscribe = presence.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    self,
    others,
    all,
    update(data) {
      requireTypedRoom<TPresence>(context.room.value, 'usePresence').usePresence().update(data);
    },
    replace(data) {
      requireTypedRoom<TPresence>(context.room.value, 'usePresence').usePresence().replace(data);
    },
  };
}

/**
 * Subscribes to cursor snapshots and returns mounting helpers.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional cursor tracking configuration.
 * @returns The cursor snapshot and mounting helpers.
 */
export function useCursors<
  TCursor extends CursorData = CursorData,
  TPresence extends PresenceData = PresenceData,
>(options?: CursorOptions): UseCursorsResult<TCursor> {
  const context = useRoomfulContext('useCursors');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useCursors');
  const initialEngine = initialRoom.useCursors<TCursor>(options);
  const cacheRef: { current: CursorSnapshotCache<TPresence, TCursor> | null } = {
    current: null,
  };
  const ref = shallowRef<HTMLElement | null>(null);
  const cursors = shallowRef(readCursorSnapshot(initialRoom, initialEngine, cacheRef));
  const engineRef = shallowRef(initialEngine);
  let mountedEngine: CursorEngine<TCursor> | null = null;
  let mountedElement: HTMLElement | null = null;

  const syncMountedCursorEngine = (): void => {
    const element = ref.value;
    const engine = engineRef.value;

    if (element === null) {
      if (mountedEngine !== null) {
        mountedEngine.unmount();
        mountedEngine = null;
        mountedElement = null;
      }
      return;
    }

    if (mountedEngine === engine && mountedElement === element) {
      return;
    }

    mountedEngine?.unmount();
    engine.mount(element);
    mountedEngine = engine;
    mountedElement = element;
  };

  watch(
    ref,
    () => {
      syncMountedCursorEngine();
    },
    {
      flush: 'sync',
    },
  );

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useCursors');
      const engine = typedRoom.useCursors<TCursor>(options);
      engineRef.value = engine;

      const syncSnapshot = (): void => {
        const nextSnapshot = readCursorSnapshot(typedRoom, engine, cacheRef);
        if (cursors.value === nextSnapshot) {
          return;
        }

        cursors.value = nextSnapshot;
      };

      syncMountedCursorEngine();
      syncSnapshot();

      const unsubscribe = engine.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();

        if (mountedEngine === engine) {
          engine.unmount();
          mountedEngine = null;
          mountedElement = null;
        }
      });
    },
    {
      immediate: true,
    },
  );

  return {
    ref,
    cursors,
    mount(element) {
      ref.value = element;
      syncMountedCursorEngine();
    },
    unmount() {
      ref.value = null;
      syncMountedCursorEngine();
    },
  };
}

/**
 * Subscribes to viewport snapshots and returns mounting and control helpers.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional viewport tracking configuration.
 * @returns The remote viewport states plus mounting and follow controls.
 */
export function useViewport<TPresence extends PresenceData = PresenceData>(
  options?: ViewportOptions,
): UseViewportResult {
  const context = useRoomfulContext('useViewport');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useViewport');
  const initialEngine = initialRoom.useViewport(options);
  const cacheRef: { current: ViewportSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const ref = shallowRef<HTMLElement | null>(null);
  const states = shallowRef(readViewportSnapshot(initialRoom, initialEngine, cacheRef));
  const engineRef = shallowRef(initialEngine);
  let mountedEngine: ViewportEngine | null = null;
  let mountedElement: HTMLElement | null = null;

  const syncMountedViewportEngine = (): void => {
    const element = ref.value;
    const engine = engineRef.value;

    if (element === null) {
      if (mountedEngine !== null) {
        mountedEngine.unmount();
        mountedEngine = null;
        mountedElement = null;
      }
      return;
    }

    if (mountedEngine === engine && mountedElement === element) {
      return;
    }

    mountedEngine?.unmount();
    engine.mount(element);
    mountedEngine = engine;
    mountedElement = element;
  };

  watch(
    ref,
    () => {
      syncMountedViewportEngine();
    },
    {
      flush: 'sync',
    },
  );

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useViewport');
      const engine = typedRoom.useViewport(options);
      engineRef.value = engine;

      const syncSnapshot = (): void => {
        const nextSnapshot = readViewportSnapshot(typedRoom, engine, cacheRef);
        if (states.value === nextSnapshot) {
          return;
        }

        states.value = nextSnapshot;
      };

      syncMountedViewportEngine();
      syncSnapshot();

      const unsubscribe = engine.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();

        if (mountedEngine === engine) {
          engine.unmount();
          mountedEngine = null;
          mountedElement = null;
        }
      });
    },
    {
      immediate: true,
    },
  );

  return {
    ref,
    states,
    mount(element) {
      ref.value = element;
      syncMountedViewportEngine();
    },
    unmount() {
      ref.value = null;
      syncMountedViewportEngine();
    },
    broadcast() {
      engineRef.value.broadcast();
    },
    stopBroadcast() {
      engineRef.value.stopBroadcast();
    },
    present() {
      engineRef.value.present();
    },
    stopPresenting() {
      engineRef.value.stopPresenting();
    },
    follow(peerId) {
      engineRef.value.follow(peerId);
    },
    unfollow() {
      engineRef.value.unfollow();
    },
  };
}

/**
 * Subscribes to remote pointer beams and returns mounting and control helpers.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional pointer tracking configuration.
 * @returns The remote beams plus a mounting ref and activate/deactivate/render controls.
 */
export function usePointer<TPresence extends PresenceData = PresenceData>(
  options?: PointerOptions,
): UsePointerResult {
  const context = useRoomfulContext('usePointer');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'usePointer');
  const initialEngine = initialRoom.usePointer(options);
  const cacheRef: { current: PointerSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const ref = shallowRef<HTMLElement | null>(null);
  const beams = shallowRef(readPointerSnapshot(initialRoom, initialEngine, cacheRef));
  const engineRef = shallowRef(initialEngine);
  let mountedEngine: PointerEngine | null = null;
  let mountedElement: HTMLElement | null = null;

  const syncMountedPointerEngine = (): void => {
    const element = ref.value;
    const engine = engineRef.value;

    if (element === null) {
      if (mountedEngine !== null) {
        mountedEngine.unmount();
        mountedEngine = null;
        mountedElement = null;
      }
      return;
    }

    if (mountedEngine === engine && mountedElement === element) {
      return;
    }

    mountedEngine?.unmount();
    engine.mount(element);
    mountedEngine = engine;
    mountedElement = element;
  };

  watch(
    ref,
    () => {
      syncMountedPointerEngine();
    },
    {
      flush: 'sync',
    },
  );

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'usePointer');
      const engine = typedRoom.usePointer(options);
      engineRef.value = engine;

      const syncSnapshot = (): void => {
        const nextSnapshot = readPointerSnapshot(typedRoom, engine, cacheRef);
        if (beams.value === nextSnapshot) {
          return;
        }

        beams.value = nextSnapshot;
      };

      syncMountedPointerEngine();
      syncSnapshot();

      const unsubscribe = engine.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();

        if (mountedEngine === engine) {
          engine.unmount();
          mountedEngine = null;
          mountedElement = null;
        }
      });
    },
    {
      immediate: true,
    },
  );

  return {
    ref,
    beams,
    mount(element) {
      ref.value = element;
      syncMountedPointerEngine();
    },
    unmount() {
      ref.value = null;
      syncMountedPointerEngine();
    },
    activate() {
      engineRef.value.activate();
    },
    deactivate() {
      engineRef.value.deactivate();
    },
    render(renderOptions) {
      return engineRef.value.render(renderOptions);
    },
  };
}

/**
 * Subscribes to all lock states and returns the lock engine controls.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The held lock states plus acquire/release controls.
 */
export function useLocks<TPresence extends PresenceData = PresenceData>(): UseLocksResult {
  const context = useRoomfulContext('useLocks');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useLocks');
  const initialEngine = initialRoom.useLocks();
  const cacheRef: { current: LocksSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const locks = shallowRef(readLocksSnapshot(initialRoom, initialEngine, cacheRef));

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useLocks');
      const engine = typedRoom.useLocks();

      const syncSnapshot = (): void => {
        const nextSnapshot = readLocksSnapshot(typedRoom, engine, cacheRef);
        if (locks.value === nextSnapshot) {
          return;
        }

        locks.value = nextSnapshot;
      };

      syncSnapshot();

      const unsubscribe = engine.subscribeAll(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    locks,
    acquire(key, options) {
      return requireTypedRoom<TPresence>(context.room.value, 'useLocks')
        .useLocks()
        .acquire(key, options);
    },
    release(key) {
      requireTypedRoom<TPresence>(context.room.value, 'useLocks').useLocks().release(key);
    },
    releaseAll() {
      requireTypedRoom<TPresence>(context.room.value, 'useLocks').useLocks().releaseAll();
    },
    isLocked(key) {
      return requireTypedRoom<TPresence>(context.room.value, 'useLocks').useLocks().isLocked(key);
    },
    getHolder(key) {
      return requireTypedRoom<TPresence>(context.room.value, 'useLocks').useLocks().getHolder(key);
    },
  };
}

/**
 * Subscribes to collaborative comment threads and returns the thread mutators.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional storage backend configuration.
 * @returns A readonly ref of threads plus add/reply/resolve/reopen and filter helpers.
 */
export function useComments<TPresence extends PresenceData = PresenceData>(
  options?: CommentsOptions,
): UseCommentsResult {
  const context = useRoomfulContext('useComments');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useComments');
  const initialEngine = initialRoom.useComments(options);
  const cacheRef: { current: CommentsSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const threads = shallowRef(readCommentsSnapshot(initialRoom, initialEngine, cacheRef));

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useComments');
      const engine = typedRoom.useComments(options);

      const syncSnapshot = (): void => {
        const nextSnapshot = readCommentsSnapshot(typedRoom, engine, cacheRef);
        if (threads.value === nextSnapshot) {
          return;
        }

        threads.value = nextSnapshot;
      };

      syncSnapshot();

      const unsubscribe = engine.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    threads,
    add(input) {
      return requireTypedRoom<TPresence>(context.room.value, 'useComments')
        .useComments(options)
        .add(input);
    },
    reply(threadId, text) {
      return requireTypedRoom<TPresence>(context.room.value, 'useComments')
        .useComments(options)
        .thread(threadId)
        .reply(text);
    },
    resolve(threadId) {
      return requireTypedRoom<TPresence>(context.room.value, 'useComments')
        .useComments(options)
        .thread(threadId)
        .resolve();
    },
    reopen(threadId) {
      return requireTypedRoom<TPresence>(context.room.value, 'useComments')
        .useComments(options)
        .thread(threadId)
        .reopen();
    },
    getByElement(elementId) {
      return requireTypedRoom<TPresence>(context.room.value, 'useComments')
        .useComments(options)
        .getByElement(elementId);
    },
    getOpen() {
      return requireTypedRoom<TPresence>(context.room.value, 'useComments')
        .useComments(options)
        .getOpen();
    },
  };
}

/**
 * Subscribes to the shared activity engine: a reactive, bounded, newest-first
 * feed of room activity plus a `record` control.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional activity configuration (e.g. `limit`).
 * @returns A readonly ref for the feed plus `record`.
 */
export function useActivity<TPresence extends PresenceData = PresenceData>(
  options?: ActivityOptions,
): UseActivityResult {
  const context = useRoomfulContext('useActivity');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useActivity');
  const initialEngine = initialRoom.useActivity(options);
  const cacheRef: { current: ActivitySnapshotCache<TPresence> | null } = {
    current: null,
  };
  const entries = shallowRef(readActivitySnapshot(initialRoom, initialEngine, cacheRef));

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useActivity');
      const engine = typedRoom.useActivity(options);

      const syncSnapshot = (): void => {
        const nextSnapshot = readActivitySnapshot(typedRoom, engine, cacheRef);
        if (entries.value === nextSnapshot) {
          return;
        }

        entries.value = nextSnapshot;
      };

      syncSnapshot();

      const unsubscribe = engine.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    entries,
    record(type, data) {
      return requireTypedRoom<TPresence>(context.room.value, 'useActivity')
        .useActivity(options)
        .record(type, data);
    },
  };
}

/**
 * Subscribes to the collaborative history engine: a reactive shared timeline
 * plus reactive `canUndo`/`canRedo`, with capture/transaction/undo/redo controls.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional history configuration.
 * @returns Readonly refs for the timeline and undo/redo availability plus controls.
 */
export function useHistory<TPresence extends PresenceData = PresenceData>(
  options?: HistoryOptions,
): UseHistoryResult {
  const context = useRoomfulContext('useHistory');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useHistory');
  const initialEngine = initialRoom.useHistory(options);
  const cacheRef: { current: HistorySnapshotCache<TPresence> | null } = {
    current: null,
  };
  const timeline = shallowRef(readHistorySnapshot(initialRoom, initialEngine, cacheRef));
  const canUndo = shallowRef(initialEngine.canUndo());
  const canRedo = shallowRef(initialEngine.canRedo());

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useHistory');
      const engine = typedRoom.useHistory(options);

      const syncSnapshot = (): void => {
        const nextSnapshot = readHistorySnapshot(typedRoom, engine, cacheRef);
        if (timeline.value !== nextSnapshot) {
          timeline.value = nextSnapshot;
        }

        const nextCanUndo = engine.canUndo();
        if (canUndo.value !== nextCanUndo) {
          canUndo.value = nextCanUndo;
        }

        const nextCanRedo = engine.canRedo();
        if (canRedo.value !== nextCanRedo) {
          canRedo.value = nextCanRedo;
        }
      };

      syncSnapshot();

      const unsubscribe = engine.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    timeline,
    canUndo,
    canRedo,
    capture(action, payload) {
      requireTypedRoom<TPresence>(context.room.value, 'useHistory')
        .useHistory(options)
        .capture(action, payload);
    },
    transaction(name, fn) {
      requireTypedRoom<TPresence>(context.room.value, 'useHistory')
        .useHistory(options)
        .transaction(name, fn);
    },
    undo() {
      return requireTypedRoom<TPresence>(context.room.value, 'useHistory')
        .useHistory(options)
        .undo();
    },
    redo() {
      return requireTypedRoom<TPresence>(context.room.value, 'useHistory')
        .useHistory(options)
        .redo();
    },
  };
}

/**
 * Subscribes to the session recording engine: reactive `isRecording`,
 * `frameCount`, and `durationMs` primitives plus start/stop/replay/export
 * controls.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns Readonly refs for the recording state plus controls.
 */
export function useRecording<TPresence extends PresenceData = PresenceData>(): UseRecordingResult {
  const context = useRoomfulContext('useRecording');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useRecording');
  const initialEngine = initialRoom.useRecording();
  const initialState = initialEngine.getState();
  const isRecording = shallowRef(initialState.isRecording);
  const frameCount = shallowRef(initialState.frameCount);
  const durationMs = shallowRef(initialState.durationMs);

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useRecording');
      const engine = typedRoom.useRecording();

      const sync = (): void => {
        const state = engine.getState();
        if (isRecording.value !== state.isRecording) {
          isRecording.value = state.isRecording;
        }

        if (frameCount.value !== state.frameCount) {
          frameCount.value = state.frameCount;
        }

        if (durationMs.value !== state.durationMs) {
          durationMs.value = state.durationMs;
        }
      };

      sync();

      const unsubscribe = engine.subscribe(() => {
        sync();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    isRecording,
    frameCount,
    durationMs,
    start() {
      requireTypedRoom<TPresence>(context.room.value, 'useRecording').useRecording().start();
    },
    stop() {
      requireTypedRoom<TPresence>(context.room.value, 'useRecording').useRecording().stop();
    },
    replay(recording) {
      return requireTypedRoom<TPresence>(context.room.value, 'useRecording')
        .useRecording()
        .replay(recording);
    },
    exportRecording() {
      return requireTypedRoom<TPresence>(context.room.value, 'useRecording')
        .useRecording()
        .export();
    },
  };
}

/**
 * Subscribes to the resolved state of a single lock key (the lock-on-focus
 * pattern: read `holder` to decide whether the local peer owns the key).
 *
 * @typeParam TPresence - The room presence shape.
 * @param key - The lock key to observe.
 * @returns A readonly ref holding the current lock state, or `null` when free.
 */
export function useLockState<TPresence extends PresenceData = PresenceData>(
  key: string,
): ReadonlyRef<LockState | null> {
  const context = useRoomfulContext('useLockState');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useLockState');
  const cacheRef: { current: LockStateSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const state = shallowRef(
    readLockStateSnapshot(initialRoom, initialRoom.useLocks(), key, cacheRef),
  );

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useLockState');
      const engine = typedRoom.useLocks();

      const commit = (nextSnapshot: LockState | null): void => {
        if (state.value === nextSnapshot) {
          return;
        }

        state.value = nextSnapshot;
      };

      commit(readLockStateSnapshot(typedRoom, engine, key, cacheRef));

      const unsubscribe = engine.subscribe(key, (lockState) => {
        commit(reconcileLockStateSnapshot(typedRoom, engine, key, lockState, cacheRef));
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return state;
}

/**
 * Binds a shared state value to Vue refs.
 *
 * @typeParam T - The shared state value type.
 * @typeParam TPresence - The room presence shape.
 * @param key - The logical binding key used to enforce a single shared-state binding per room.
 * @param options - The shared-state configuration.
 * @returns A readonly ref for the value and a setter function.
 */
export function useSharedState<T, TPresence extends PresenceData = PresenceData>(
  key: string,
  options: StateOptions<T>,
): readonly [ReadonlyRef<T>, SharedStateSetter<T>] {
  const context = useRoomfulContext('useSharedState');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useSharedState');
  const initialState = bindSharedState(initialRoom, key, options);
  const cacheRef: { current: SharedStateSnapshotCache<TPresence, T> | null } = {
    current: null,
  };
  const value = shallowRef(readSharedStateSnapshot(initialRoom, initialState, cacheRef));
  const stateRef = shallowRef(initialState);

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useSharedState');
      const state = bindSharedState(typedRoom, key, options);
      stateRef.value = state;

      const syncSnapshot = (): void => {
        const nextSnapshot = readSharedStateSnapshot(typedRoom, state, cacheRef);
        if (value.value === nextSnapshot) {
          return;
        }

        value.value = nextSnapshot;
      };

      syncSnapshot();

      const unsubscribe = state.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  const setValue: SharedStateSetter<T> = (nextValue) => {
    const state = stateRef.value;
    const previousValue = state.get();
    const resolvedValue = isStateUpdater(nextValue) ? nextValue(previousValue) : nextValue;

    if (areStructuredValuesEqual(previousValue, resolvedValue)) {
      return;
    }

    state.set(resolvedValue);
  };

  return [value, setValue] as const;
}

/**
 * Subscribes to awareness snapshots.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns Remote awareness state and local awareness mutators.
 */
export function useAwareness<TPresence extends PresenceData = PresenceData>(): UseAwarenessResult {
  const context = useRoomfulContext('useAwareness');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useAwareness');
  const cacheRef: { current: AwarenessSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const others = shallowRef(
    readAwarenessSnapshot(initialRoom, initialRoom.useAwareness(), cacheRef),
  );

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useAwareness');
      const awareness = typedRoom.useAwareness();
      const syncSnapshot = (): void => {
        const nextSnapshot = readAwarenessSnapshot(typedRoom, awareness, cacheRef);
        if (others.value === nextSnapshot) {
          return;
        }

        others.value = nextSnapshot;
      };

      syncSnapshot();

      const unsubscribe = awareness.subscribe(() => {
        syncSnapshot();
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return {
    others,
    set(value) {
      requireTypedRoom<TPresence>(context.room.value, 'useAwareness').useAwareness().set(value);
    },
    setFocus(elementId) {
      requireTypedRoom<TPresence>(context.room.value, 'useAwareness')
        .useAwareness()
        .setFocus(elementId);
    },
    setSelection(selection) {
      requireTypedRoom<TPresence>(context.room.value, 'useAwareness')
        .useAwareness()
        .setSelection(selection);
    },
    setTyping(isTyping) {
      requireTypedRoom<TPresence>(context.room.value, 'useAwareness')
        .useAwareness()
        .setTyping(isTyping);
    },
  };
}

/**
 * Subscribes to the current room connection status.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns A readonly ref holding the latest connection status.
 */
export function useConnectionStatus<
  TPresence extends PresenceData = PresenceData,
>(): ReadonlyRef<RoomStatus> {
  const context = useRoomfulContext('useConnectionStatus');
  const initialRoom = requireTypedRoom<TPresence>(context.room.value, 'useConnectionStatus');
  const status = shallowRef<RoomStatus>(initialRoom.status);

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useConnectionStatus');
      const syncStatus = (): void => {
        if (status.value === typedRoom.status) {
          return;
        }

        status.value = typedRoom.status;
      };

      const unsubscribeConnected = typedRoom.on('connected', syncStatus);
      const unsubscribeReconnecting = typedRoom.on('reconnecting', syncStatus);
      const unsubscribeDisconnected = typedRoom.on('disconnected', syncStatus);
      const unsubscribeError = typedRoom.on('error', syncStatus);

      syncStatus();

      onCleanup(() => {
        unsubscribeError();
        unsubscribeDisconnected();
        unsubscribeReconnecting();
        unsubscribeConnected();
      });
    },
    {
      immediate: true,
    },
  );

  return status;
}

/**
 * Subscribes to a custom event channel and returns an emitter for that channel.
 *
 * @typeParam TPayload - The payload type for the channel.
 * @typeParam TPresence - The room presence shape.
 * @param name - The custom event channel name.
 * @param handler - The callback invoked for incoming events.
 * @returns A function that emits payloads on the same channel.
 */
export function useEvent<TPayload = unknown, TPresence extends PresenceData = PresenceData>(
  name: string,
  handler: EventHandlerRef<TPayload, TPresence>,
): (payload: TPayload) => void {
  const context = useRoomfulContext('useEvent');
  const handlerRef = shallowRef<EventHandlerRef<unknown, TPresence>>(handler);

  watch(
    context.room,
    (room, _previousRoom, onCleanup) => {
      const typedRoom = requireTypedRoom<TPresence>(room, 'useEvent');
      const unsubscribe = typedRoom.useEvents().on(name, (payload, from) => {
        handlerRef.value(payload, from);
      });

      onCleanup(() => {
        unsubscribe();
      });
    },
    {
      immediate: true,
    },
  );

  return (payload: TPayload): void => {
    requireTypedRoom<TPresence>(context.room.value, 'useEvent').useEvents().emit(name, payload);
  };
}

function useRoomfulContext(composableName: string): RoomfulPluginContext {
  if (getCurrentInstance() === null) {
    throw new RoomfulError(
      'INVALID_STATE',
      `${composableName}() must be called from setup() after app.use(RoomfulPlugin, options).`,
      false,
    );
  }

  const context = inject(ROOMFUL_CONTEXT_KEY, null);
  if (context === null) {
    throw new RoomfulError(
      'INVALID_STATE',
      `${composableName}() requires app.use(RoomfulPlugin, options).`,
      false,
    );
  }

  return context;
}

function requireTypedRoom<TPresence extends PresenceData>(
  value: unknown,
  composableName: string,
): Room<TPresence> {
  if (!isRoom<TPresence>(value)) {
    throw new RoomfulError(
      'INVALID_STATE',
      `${composableName}() requires app.use(RoomfulPlugin, options).`,
      false,
    );
  }

  return value;
}

function createRoomOptions<TPresence extends PresenceData>(
  options: RoomfulPluginOptions<TPresence>,
): RoomOptions<TPresence> {
  const roomOptions: RoomOptions<TPresence> = {};

  if (options.transport !== undefined) {
    roomOptions.transport = options.transport;
  }

  if (options.presence !== undefined) {
    roomOptions.presence = options.presence;
  }

  if (options.maxPeers !== undefined) {
    roomOptions.maxPeers = options.maxPeers;
  }

  if (options.stunUrls !== undefined) {
    roomOptions.stunUrls = options.stunUrls;
  }

  if (options.relayUrl !== undefined) {
    roomOptions.relayUrl = options.relayUrl;
  }

  if (options.relayAuth !== undefined) {
    roomOptions.relayAuth = options.relayAuth;
  }

  if (options.reconnect !== undefined) {
    roomOptions.reconnect = options.reconnect;
  }

  if (options.webrtc !== undefined) {
    roomOptions.webrtc = options.webrtc;
  }

  if (options.encryption !== undefined) {
    roomOptions.encryption = options.encryption;
  }

  if (options.debug !== undefined) {
    roomOptions.debug = options.debug;
  }

  return roomOptions;
}

function createRoomfulCursorsDirective(
  context: RoomfulPluginContext,
  states: Map<HTMLElement, MountedCursorDirectiveState>,
): ObjectDirective<HTMLElement, CursorOptions | undefined> {
  return {
    mounted(element, binding) {
      bindCursorDirectiveElement(context, states, element, binding.value);
    },
    updated(element, binding) {
      const room = context.room.value;
      const currentState = states.get(element) ?? null;
      if (
        currentState !== null &&
        currentState.room === room &&
        areCursorOptionsEqual(currentState.options, binding.value)
      ) {
        return;
      }

      unbindCursorDirectiveElement(states, element);
      bindCursorDirectiveElement(context, states, element, binding.value);
    },
    unmounted(element) {
      unbindCursorDirectiveElement(states, element);
    },
  };
}

function bindCursorDirectiveElement(
  context: RoomfulPluginContext,
  states: Map<HTMLElement, MountedCursorDirectiveState>,
  element: HTMLElement,
  options: CursorOptions | undefined,
): void {
  const room = requireTypedRoom<PresenceData>(context.room.value, 'v-roomful-cursors');
  const engine = room.useCursors(options);
  engine.mount(element);
  states.set(element, {
    room,
    engine,
    options,
  });
}

function unbindCursorDirectiveElement(
  states: Map<HTMLElement, MountedCursorDirectiveState>,
  element: HTMLElement,
): void {
  const state = states.get(element) ?? null;
  if (state === null) {
    return;
  }

  state.engine.unmount();
  states.delete(element);
}

function bindSharedState<T, TPresence extends PresenceData>(
  room: Room<TPresence>,
  key: string,
  options: StateOptions<T>,
): StateEngine<T> {
  const existingBinding = sharedStateBindings.get(room) ?? null;

  if (existingBinding !== null) {
    assertCompatibleSharedStateBinding(existingBinding, key, options);
  }

  const state = room.useState(options);
  const binding = existingBinding ?? createSharedStateBinding(key, options);
  sharedStateBindings.set(room, binding);

  if (binding.persist !== true && options.persist === true && binding.strategy === 'lww') {
    binding.persist = true;
  }

  return state;
}

function readPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: { current: PresenceSnapshotCache<TPresence> | null },
): {
  self: Peer<TPresence>;
  others: Peer<TPresence>[];
  all: Peer<TPresence>[];
} {
  const all = presence.getAll();
  const self = readSelfPeer(room, presence, all);
  const others = all.filter((peer) => {
    return peer.id !== room.peerId;
  });
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === presence) {
    const previousSnapshot = previous.snapshot;
    const isAllEqual = arePeerArraysEqual(previousSnapshot.all, all);
    const isSelfEqual = arePeersEqual(previousSnapshot.self, self);
    const isOthersEqual = arePeerArraysEqual(previousSnapshot.others, others);

    if (isAllEqual && isSelfEqual && isOthersEqual) {
      return previousSnapshot;
    }

    const nextSnapshot = {
      self: isSelfEqual ? previousSnapshot.self : self,
      others: isOthersEqual ? previousSnapshot.others : others,
      all: isAllEqual ? previousSnapshot.all : all,
    };

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  const snapshot = {
    self,
    others,
    all,
  };

  cacheRef.current = {
    room,
    engine: presence,
    snapshot,
  };
  return snapshot;
}

function readCursorSnapshot<TPresence extends PresenceData, TCursor extends CursorData>(
  room: Room<TPresence>,
  cursors: CursorEngine<TCursor>,
  cacheRef: { current: CursorSnapshotCache<TPresence, TCursor> | null },
): CursorPosition<TCursor>[] {
  const nextSnapshot = cursors.getPositions();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === cursors) {
    const previousSnapshot = previous.snapshot;
    if (areCursorArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((position, index) => {
      const previousPosition = previousSnapshot[index];
      if (previousPosition !== undefined && areCursorPositionsEqual(previousPosition, position)) {
        return previousPosition;
      }

      return position;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: cursors,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function areViewportArraysEqual(
  previous: readonly ViewportState[],
  next: readonly ViewportState[],
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

function readViewportSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  viewport: ViewportEngine,
  cacheRef: { current: ViewportSnapshotCache<TPresence> | null },
): ViewportState[] {
  const nextSnapshot = viewport.getAll();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === viewport) {
    const previousSnapshot = previous.snapshot;
    if (areViewportArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((state, index) => {
      const previousState = previousSnapshot[index];
      if (previousState !== undefined && areStructuredValuesEqual(previousState, state)) {
        return previousState;
      }

      return state;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: viewport,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function arePointerArraysEqual(
  previous: readonly PointerBeam[],
  next: readonly PointerBeam[],
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

function readPointerSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  pointer: PointerEngine,
  cacheRef: { current: PointerSnapshotCache<TPresence> | null },
): PointerBeam[] {
  const nextSnapshot = pointer.getAll();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === pointer) {
    const previousSnapshot = previous.snapshot;
    if (arePointerArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((beam, index) => {
      const previousBeam = previousSnapshot[index];
      if (previousBeam !== undefined && areStructuredValuesEqual(previousBeam, beam)) {
        return previousBeam;
      }

      return beam;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: pointer,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function areLockArraysEqual(previous: readonly LockState[], next: readonly LockState[]): boolean {
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

function readLocksSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  cacheRef: { current: LocksSnapshotCache<TPresence> | null },
): LockState[] {
  const nextSnapshot = locks.getAll();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === locks) {
    const previousSnapshot = previous.snapshot;
    if (areLockArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((state, index) => {
      const previousState = previousSnapshot[index];
      if (previousState !== undefined && areStructuredValuesEqual(previousState, state)) {
        return previousState;
      }

      return state;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: locks,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function areCommentThreadArraysEqual(
  previous: readonly CommentThread[],
  next: readonly CommentThread[],
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

function readCommentsSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  comments: CommentsEngine,
  cacheRef: { current: CommentsSnapshotCache<TPresence> | null },
): CommentThread[] {
  const nextSnapshot = comments.getAll();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === comments) {
    const previousSnapshot = previous.snapshot;
    if (areCommentThreadArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((thread, index) => {
      const previousThread = previousSnapshot[index];
      if (previousThread !== undefined && areStructuredValuesEqual(previousThread, thread)) {
        return previousThread;
      }

      return thread;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: comments,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function areActivityEntryArraysEqual(
  previous: readonly ActivityEntry[],
  next: readonly ActivityEntry[],
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

function readActivitySnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  activity: ActivityEngine,
  cacheRef: { current: ActivitySnapshotCache<TPresence> | null },
): ActivityEntry[] {
  const nextSnapshot = activity.getEntries();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === activity) {
    const previousSnapshot = previous.snapshot;
    if (areActivityEntryArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((entry, index) => {
      const previousEntry = previousSnapshot[index];
      if (previousEntry !== undefined && areStructuredValuesEqual(previousEntry, entry)) {
        return previousEntry;
      }

      return entry;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: activity,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function areTimelineArraysEqual(
  previous: readonly TimelineEntry[],
  next: readonly TimelineEntry[],
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

function readHistorySnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  history: HistoryEngine,
  cacheRef: { current: HistorySnapshotCache<TPresence> | null },
): TimelineEntry[] {
  const nextSnapshot = history.timeline();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === history) {
    const previousSnapshot = previous.snapshot;
    if (areTimelineArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((entry, index) => {
      const previousEntry = previousSnapshot[index];
      if (previousEntry !== undefined && areStructuredValuesEqual(previousEntry, entry)) {
        return previousEntry;
      }

      return entry;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: history,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function resolveSingleLockState(locks: LockEngine, key: string): LockState | null {
  const holder = locks.getHolder(key);
  if (!holder) {
    return null;
  }

  return (
    locks.getAll().find((state) => {
      return state.key === key;
    }) ?? null
  );
}

function commitLockStateSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  key: string,
  nextState: LockState | null,
  cacheRef: { current: LockStateSnapshotCache<TPresence> | null },
): LockState | null {
  const previous = cacheRef.current;

  if (
    previous !== null &&
    previous.room === room &&
    previous.engine === locks &&
    previous.key === key
  ) {
    const previousSnapshot = previous.snapshot;
    if (
      previousSnapshot === nextState ||
      (previousSnapshot !== null &&
        nextState !== null &&
        areStructuredValuesEqual(previousSnapshot, nextState))
    ) {
      return previousSnapshot;
    }

    previous.snapshot = nextState;
    return nextState;
  }

  cacheRef.current = {
    room,
    engine: locks,
    key,
    snapshot: nextState,
  };
  return nextState;
}

function readLockStateSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  key: string,
  cacheRef: { current: LockStateSnapshotCache<TPresence> | null },
): LockState | null {
  return commitLockStateSnapshot(room, locks, key, resolveSingleLockState(locks, key), cacheRef);
}

function reconcileLockStateSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  key: string,
  state: LockState,
  cacheRef: { current: LockStateSnapshotCache<TPresence> | null },
): LockState | null {
  const nextState = state.holder === null ? null : state;
  return commitLockStateSnapshot(room, locks, key, nextState, cacheRef);
}

function readAwarenessSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  awareness: AwarenessEngine,
  cacheRef: { current: AwarenessSnapshotCache<TPresence> | null },
): AwarenessState[] {
  const nextOthers = awareness.getAll().filter((entry) => {
    return entry.peerId !== room.peerId;
  });
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === awareness) {
    const previousSnapshot = previous.snapshot;
    if (areAwarenessArraysEqual(previousSnapshot, nextOthers)) {
      return previousSnapshot;
    }

    previous.snapshot = nextOthers.map((entry, index) => {
      const previousEntry = previousSnapshot[index];
      if (previousEntry !== undefined && areStructuredValuesEqual(previousEntry, entry)) {
        return previousEntry;
      }

      return entry;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: awareness,
    snapshot: nextOthers,
  };
  return nextOthers;
}

function readSharedStateSnapshot<TPresence extends PresenceData, T>(
  room: Room<TPresence>,
  state: StateEngine<T>,
  cacheRef: { current: SharedStateSnapshotCache<TPresence, T> | null },
): T {
  const nextSnapshot = state.get();
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === state) {
    if (areStructuredValuesEqual(previous.snapshot, nextSnapshot)) {
      return previous.snapshot;
    }

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  cacheRef.current = {
    room,
    engine: state,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function areCursorOptionsEqual(
  previous: CursorOptions | undefined,
  next: CursorOptions | undefined,
): boolean {
  return areShallowObjectsEqual(previous, next);
}

function areShallowObjectsEqual(a: object | undefined, b: object | undefined): boolean {
  if (a === b) {
    return true;
  }

  if (a === undefined || b === undefined) {
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

function isStateUpdater<T>(value: SharedStateUpdater<T>): value is (previous: T) => T {
  return typeof value === 'function';
}

function isRoomfulPluginOptions(value: unknown): value is RoomfulPluginOptions<PresenceData> {
  return isObjectLike(value) && typeof Reflect.get(value, 'roomId') === 'string';
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
    hasFunction(value, 'useViewport') &&
    hasFunction(value, 'usePointer') &&
    hasFunction(value, 'useLocks') &&
    hasFunction(value, 'useComments') &&
    hasFunction(value, 'useHistory') &&
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

declare module 'vue' {
  interface GlobalDirectives {
    vRoomfulCursors: RoomfulCursorsDirective;
  }
}
