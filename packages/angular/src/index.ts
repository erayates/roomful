import type { EnvironmentProviders, Signal } from '@angular/core';
import {
  assertInInjectionContext,
  DestroyRef,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
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
  Room,
  RoomOptions,
  RoomStatus,
  StateEngine,
  StateOptions,
  TimelineEntry,
  Unsubscribe,
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

/**
 * Mirrors React-style updater semantics for the Angular shared-state setter.
 *
 * @typeParam T - The shared state value type.
 */
export type SetStateAction<T> = T | ((previous: T) => T);

/**
 * Updates a shared state binding and returns the resolved value.
 *
 * @typeParam T - The shared state value type.
 * @param nextValue - The next value or an updater derived from the previous value.
 * @returns The resolved shared state value.
 */
export type SharedStateSetter<T> = (nextValue: SetStateAction<T>) => T;

/**
 * Configures {@link provideRoomful}.
 *
 * @typeParam TPresence - The room presence shape inferred from `presence`.
 */
export interface RoomfulProviderOptions<
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
 * Describes the return value of {@link injectPresence}.
 *
 * @typeParam TPresence - The room presence shape.
 */
export interface InjectPresenceResult<TPresence extends PresenceData = PresenceData> {
  /**
   * Exposes the local peer snapshot.
   */
  self: Signal<Peer<TPresence>>;

  /**
   * Exposes remote peers only.
   */
  others: Signal<Peer<TPresence>[]>;

  /**
   * Exposes local and remote peers.
   */
  all: Signal<Peer<TPresence>[]>;

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
 * Describes the return value of {@link injectCursors}.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 */
export interface InjectCursorsResult<TCursor extends CursorData = CursorData> {
  /**
   * Exposes the latest cursor positions.
   */
  cursors: Signal<CursorPosition<TCursor>[]>;

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
 * Describes the return value of {@link injectViewport}.
 */
export interface InjectViewportResult {
  /**
   * Exposes remote peer viewport states only.
   */
  states: Signal<ViewportState[]>;

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
 * Describes the return value of {@link injectPointer}.
 */
export interface InjectPointerResult {
  /**
   * Exposes remote peers' pointer beams only.
   */
  beams: Signal<PointerBeam[]>;

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
 * Describes the return value of {@link injectAwareness}.
 */
export interface InjectAwarenessResult {
  /**
   * Exposes remote awareness state only.
   */
  others: Signal<AwarenessState[]>;

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
 * Describes the return value of {@link injectLocks}.
 */
export interface InjectLocksResult {
  /**
   * Exposes the resolved state of every currently-held lock.
   */
  locks: Signal<LockState[]>;

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
 * Describes the return value of {@link injectComments}.
 */
export interface InjectCommentsResult {
  /**
   * Exposes the current comment threads, oldest first. Reactive: updates on any
   * local or remote thread change.
   */
  threads: Signal<CommentThread[]>;

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
 * Describes the return value of {@link injectActivity}.
 */
export interface InjectActivityResult {
  /**
   * Exposes the current activity feed, newest first. Reactive: updates on any
   * local or remote entry.
   */
  entries: Signal<ActivityEntry[]>;

  /**
   * Records a new activity entry authored by the local peer and broadcasts it.
   */
  record: ActivityEngine['record'];
}

/**
 * Describes the return value of {@link injectHistory}.
 */
export interface InjectHistoryResult {
  /**
   * Exposes the shared timeline of every peer's entries, oldest first. Reactive:
   * updates on any local or remote timeline change.
   */
  timeline: Signal<TimelineEntry[]>;

  /**
   * Reports whether the local peer has a tracked transaction to undo. Reactive.
   */
  canUndo: Signal<boolean>;

  /**
   * Reports whether the local peer has an undone transaction to redo. Reactive.
   */
  canRedo: Signal<boolean>;

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
 * Describes the return value of {@link injectRecording}.
 */
export interface InjectRecordingResult {
  /**
   * Reports whether the recorder is currently capturing wire signals. Reactive.
   */
  isRecording: Signal<boolean>;

  /**
   * Reports how many signals the current take has captured. Reactive:
   * increments as traffic flows while recording.
   */
  frameCount: Signal<number>;

  /**
   * Reports the span of the current take in milliseconds. Reactive.
   */
  durationMs: Signal<number>;

  /**
   * Begins capturing, discarding any previous take.
   */
  start: RecordingEngine['start'];

  /**
   * Stops capturing; the captured frames remain available.
   */
  stop: RecordingEngine['stop'];

  /**
   * Builds a timed playback session for a recording, or the current take.
   */
  replay: RecordingEngine['replay'];

  /**
   * Serializes the current take into a portable recording (named to stay
   * destructurable, since `export` is a reserved word).
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

interface PresenceSnapshot<TPresence extends PresenceData> {
  self: Peer<TPresence>;
  others: Peer<TPresence>[];
  all: Peer<TPresence>[];
}

interface PresenceSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: PresenceSnapshot<TPresence>;
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

interface PeerSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: Peer<TPresence>[];
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

type EventHandlerRef<TPayload, TPresence extends PresenceData> = {
  bivarianceHack(payload: TPayload, from: Peer<TPresence>): void;
}['bivarianceHack'];

const sharedStateBindings = new WeakMap<Room<PresenceData>, SharedStateBinding>();

/**
 * Carries the active room through Angular dependency injection.
 *
 * Provided by {@link provideRoomful}; consumed by the `inject*` helpers. The
 * token has no default factory: the `inject*` helpers read it optionally and
 * raise a descriptive {@link RoomfulError} when it is absent, rather than
 * throwing inside Angular's injector (which would surface as a generic DI
 * error).
 */
export const ROOMFUL_ROOM = new InjectionToken<Room<PresenceData>>('ROOMFUL_ROOM');

/**
 * Creates a room and provides it to the Angular injector.
 *
 * The returned providers create the room, connect it, forward `connected`,
 * `disconnected`, and `error` events to the optional callbacks, and disconnect
 * the room when the surrounding injection context is destroyed.
 *
 * @typeParam TPresence - The room presence shape inferred from `options.presence`.
 * @param roomId - Identifies the room to create or join.
 * @param options - The room configuration and lifecycle callbacks.
 * @returns Environment providers exposing the room through {@link ROOMFUL_ROOM}.
 */
export function provideRoomful<TPresence extends PresenceData = PresenceData>(
  roomId: string,
  options: RoomfulProviderOptions<TPresence> = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ROOMFUL_ROOM,
      useFactory(): Room<TPresence> {
        const room = createRoom(roomId, createRoomOptions(options));

        const unsubscribeConnected = room.on('connected', () => {
          options.onConnect?.();
        });
        const unsubscribeDisconnected = room.on('disconnected', (payload) => {
          options.onDisconnect?.(payload);
        });
        const unsubscribeError = room.on('error', (error) => {
          options.onError?.(error);
        });

        void room.connect().catch(() => {
          return undefined;
        });

        inject(DestroyRef).onDestroy(() => {
          unsubscribeError();
          unsubscribeDisconnected();
          unsubscribeConnected();

          void room.disconnect().catch(() => {
            return undefined;
          });
        });

        return room;
      },
    },
  ]);
}

/**
 * Returns the current room provided by {@link provideRoomful}.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape to project onto the room.
 * @returns The current room instance.
 * @throws {RoomfulError} When called outside a `provideRoomful` context.
 */
export function injectRoom<TPresence extends PresenceData = PresenceData>(): Room<TPresence> {
  assertInInjectionContext(injectRoom);
  const room = inject(ROOMFUL_ROOM, { optional: true });

  if (!isRoom<TPresence>(room)) {
    throw new RoomfulError(
      'INVALID_STATE',
      'injectRoom() must be used within a provideRoomful() context.',
      false,
    );
  }

  return room;
}

/**
 * Subscribes to room presence snapshots.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The local peer, remote peers, and presence mutators as signals.
 */
export function injectPresence<
  TPresence extends PresenceData = PresenceData,
>(): InjectPresenceResult<TPresence> {
  assertInInjectionContext(injectPresence);
  const room = injectRoom<TPresence>();
  const presence = room.usePresence();
  const cacheRef: { current: PresenceSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const initialSnapshot = readPresenceSnapshot(room, presence, cacheRef);
  const self = signal(initialSnapshot.self);
  const others = signal(initialSnapshot.others);
  const all = signal(initialSnapshot.all);

  const unsubscribe = presence.subscribe(() => {
    const nextSnapshot = readPresenceSnapshot(room, presence, cacheRef);
    self.set(nextSnapshot.self);
    others.set(nextSnapshot.others);
    all.set(nextSnapshot.all);
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    self,
    others,
    all,
    update: presence.update,
    replace: presence.replace,
  };
}

/**
 * Subscribes to cursor snapshots and returns mounting helpers.
 *
 * Must be called in an injection context. Angular has no React-style callback
 * ref, so mount the engine on an element from `afterNextRender` or
 * `ngAfterViewInit` by calling {@link InjectCursorsResult.mount}.
 *
 * @typeParam TCursor - The custom cursor payload shape.
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional cursor tracking configuration.
 * @returns The cursor snapshot signal and mounting helpers.
 */
export function injectCursors<
  TCursor extends CursorData = CursorData,
  TPresence extends PresenceData = PresenceData,
>(options?: CursorOptions): InjectCursorsResult<TCursor> {
  assertInInjectionContext(injectCursors);
  const room = injectRoom<TPresence>();
  const cursorEngine = room.useCursors<TCursor>(options);
  const cacheRef: { current: CursorSnapshotCache<TPresence, TCursor> | null } = {
    current: null,
  };
  const cursors = signal(readCursorSnapshot(room, cursorEngine, cacheRef));

  let trackedElement: HTMLElement | null = null;
  let mounted = false;

  const mount = (element: HTMLElement): void => {
    if (trackedElement === element) {
      return;
    }

    if (trackedElement !== null) {
      cursorEngine.unmount();
    }

    trackedElement = element;
    cursorEngine.mount(element);
    mounted = true;
  };

  const unmount = (): void => {
    if (trackedElement === null) {
      return;
    }

    cursorEngine.unmount();
    trackedElement = null;
    mounted = false;
  };

  const unsubscribe = cursorEngine.subscribe(() => {
    cursors.set(readCursorSnapshot(room, cursorEngine, cacheRef));
  });

  inject(DestroyRef).onDestroy(() => {
    unsubscribe();

    if (mounted) {
      cursorEngine.unmount();
      trackedElement = null;
      mounted = false;
    }
  });

  return {
    cursors,
    mount,
    unmount,
  };
}

/**
 * Subscribes to viewport snapshots and returns mounting and control helpers.
 *
 * Must be called in an injection context. Angular has no React-style callback
 * ref, so mount the engine on an element from `afterNextRender` or
 * `ngAfterViewInit` by calling {@link InjectViewportResult.mount}.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional viewport tracking configuration.
 * @returns The remote viewport states signal plus mounting and follow controls.
 */
export function injectViewport<TPresence extends PresenceData = PresenceData>(
  options?: ViewportOptions,
): InjectViewportResult {
  assertInInjectionContext(injectViewport);
  const room = injectRoom<TPresence>();
  const viewportEngine = room.useViewport(options);
  const cacheRef: { current: ViewportSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const states = signal(readViewportSnapshot(room, viewportEngine, cacheRef));

  let trackedElement: HTMLElement | null = null;
  let mounted = false;

  const mount = (element: HTMLElement): void => {
    if (trackedElement === element) {
      return;
    }

    if (trackedElement !== null) {
      viewportEngine.unmount();
    }

    trackedElement = element;
    viewportEngine.mount(element);
    mounted = true;
  };

  const unmount = (): void => {
    if (trackedElement === null) {
      return;
    }

    viewportEngine.unmount();
    trackedElement = null;
    mounted = false;
  };

  const unsubscribe = viewportEngine.subscribe(() => {
    states.set(readViewportSnapshot(room, viewportEngine, cacheRef));
  });

  inject(DestroyRef).onDestroy(() => {
    unsubscribe();

    if (mounted) {
      viewportEngine.unmount();
      trackedElement = null;
      mounted = false;
    }
  });

  return {
    states,
    mount,
    unmount,
    broadcast: () => {
      viewportEngine.broadcast();
    },
    stopBroadcast: () => {
      viewportEngine.stopBroadcast();
    },
    present: () => {
      viewportEngine.present();
    },
    stopPresenting: () => {
      viewportEngine.stopPresenting();
    },
    follow: (peerId) => {
      viewportEngine.follow(peerId);
    },
    unfollow: () => {
      viewportEngine.unfollow();
    },
  };
}

/**
 * Subscribes to remote pointer beams and returns mounting and control helpers.
 *
 * Must be called in an injection context. Angular has no React-style callback
 * ref, so mount the engine on an element from `afterNextRender` or
 * `ngAfterViewInit` by calling {@link InjectPointerResult.mount}.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional pointer tracking configuration.
 * @returns The remote beams signal plus mounting and activate/deactivate/render controls.
 */
export function injectPointer<TPresence extends PresenceData = PresenceData>(
  options?: PointerOptions,
): InjectPointerResult {
  assertInInjectionContext(injectPointer);
  const room = injectRoom<TPresence>();
  const pointerEngine = room.usePointer(options);
  const cacheRef: { current: PointerSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const beams = signal(readPointerSnapshot(room, pointerEngine, cacheRef));

  let trackedElement: HTMLElement | null = null;
  let mounted = false;

  const mount = (element: HTMLElement): void => {
    if (trackedElement === element) {
      return;
    }

    if (trackedElement !== null) {
      pointerEngine.unmount();
    }

    trackedElement = element;
    pointerEngine.mount(element);
    mounted = true;
  };

  const unmount = (): void => {
    if (trackedElement === null) {
      return;
    }

    pointerEngine.unmount();
    trackedElement = null;
    mounted = false;
  };

  const unsubscribe = pointerEngine.subscribe(() => {
    beams.set(readPointerSnapshot(room, pointerEngine, cacheRef));
  });

  inject(DestroyRef).onDestroy(() => {
    unsubscribe();

    if (mounted) {
      pointerEngine.unmount();
      trackedElement = null;
      mounted = false;
    }
  });

  return {
    beams,
    mount,
    unmount,
    activate: () => {
      pointerEngine.activate();
    },
    deactivate: () => {
      pointerEngine.deactivate();
    },
    render: (renderOptions) => {
      return pointerEngine.render(renderOptions);
    },
  };
}

/**
 * Subscribes to all lock states and returns the lock engine controls.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The held lock states signal plus acquire/release controls.
 */
export function injectLocks<TPresence extends PresenceData = PresenceData>(): InjectLocksResult {
  assertInInjectionContext(injectLocks);
  const room = injectRoom<TPresence>();
  const lockEngine = room.useLocks();
  const cacheRef: { current: LocksSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const locks = signal(readLocksSnapshot(room, lockEngine, cacheRef));

  const unsubscribe = lockEngine.subscribeAll(() => {
    locks.set(readLocksSnapshot(room, lockEngine, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    locks,
    acquire: (key, options) => {
      return lockEngine.acquire(key, options);
    },
    release: (key) => {
      lockEngine.release(key);
    },
    releaseAll: () => {
      lockEngine.releaseAll();
    },
    isLocked: (key) => {
      return lockEngine.isLocked(key);
    },
    getHolder: (key) => {
      return lockEngine.getHolder(key);
    },
  };
}

/**
 * Subscribes to collaborative comment threads and returns the thread mutators.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional storage backend configuration.
 * @returns The threads signal plus add/reply/resolve/reopen and filter helpers.
 */
export function injectComments<TPresence extends PresenceData = PresenceData>(
  options?: CommentsOptions,
): InjectCommentsResult {
  assertInInjectionContext(injectComments);
  const room = injectRoom<TPresence>();
  const commentsEngine = room.useComments(options);
  const cacheRef: { current: CommentsSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const threads = signal(readCommentsSnapshot(room, commentsEngine, cacheRef));

  const unsubscribe = commentsEngine.subscribe(() => {
    threads.set(readCommentsSnapshot(room, commentsEngine, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    threads,
    add: (input) => {
      return commentsEngine.add(input);
    },
    reply: (threadId, text) => {
      return commentsEngine.thread(threadId).reply(text);
    },
    resolve: (threadId) => {
      return commentsEngine.thread(threadId).resolve();
    },
    reopen: (threadId) => {
      return commentsEngine.thread(threadId).reopen();
    },
    getByElement: (elementId) => {
      return commentsEngine.getByElement(elementId);
    },
    getOpen: () => {
      return commentsEngine.getOpen();
    },
  };
}

/**
 * Subscribes to the shared activity engine: a reactive, bounded, newest-first
 * feed of room activity plus a `record` control.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional activity configuration (e.g. `limit`).
 * @returns The entries signal plus `record`.
 */
export function injectActivity<TPresence extends PresenceData = PresenceData>(
  options?: ActivityOptions,
): InjectActivityResult {
  assertInInjectionContext(injectActivity);
  const room = injectRoom<TPresence>();
  const activityEngine = room.useActivity(options);
  const cacheRef: { current: ActivitySnapshotCache<TPresence> | null } = {
    current: null,
  };
  const entries = signal(readActivitySnapshot(room, activityEngine, cacheRef));

  const unsubscribe = activityEngine.subscribe(() => {
    entries.set(readActivitySnapshot(room, activityEngine, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    entries,
    record: (type, data) => {
      return activityEngine.record(type, data);
    },
  };
}

/**
 * Subscribes to the collaborative history engine: a reactive shared timeline
 * plus reactive `canUndo`/`canRedo`, with capture/transaction/undo/redo controls.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional history configuration.
 * @returns The timeline and undo/redo availability signals plus controls.
 */
export function injectHistory<TPresence extends PresenceData = PresenceData>(
  options?: HistoryOptions,
): InjectHistoryResult {
  assertInInjectionContext(injectHistory);
  const room = injectRoom<TPresence>();
  const historyEngine = room.useHistory(options);
  const cacheRef: { current: HistorySnapshotCache<TPresence> | null } = {
    current: null,
  };
  const timeline = signal(readHistorySnapshot(room, historyEngine, cacheRef));
  const canUndo = signal(historyEngine.canUndo());
  const canRedo = signal(historyEngine.canRedo());

  const unsubscribe = historyEngine.subscribe(() => {
    timeline.set(readHistorySnapshot(room, historyEngine, cacheRef));
    canUndo.set(historyEngine.canUndo());
    canRedo.set(historyEngine.canRedo());
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    timeline,
    canUndo,
    canRedo,
    capture: (action, payload) => {
      historyEngine.capture(action, payload);
    },
    transaction: (name, fn) => {
      historyEngine.transaction(name, fn);
    },
    undo: () => {
      return historyEngine.undo();
    },
    redo: () => {
      return historyEngine.redo();
    },
  };
}

/**
 * Subscribes to the session recording engine: three reactive primitives
 * (`isRecording`, `frameCount`, `durationMs`) plus start/stop/replay/export
 * controls. The engine taps the room's existing transport, so recording adds no
 * extra connection.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The recorder-state signals plus start/stop/replay/export controls.
 */
export function injectRecording<
  TPresence extends PresenceData = PresenceData,
>(): InjectRecordingResult {
  assertInInjectionContext(injectRecording);
  const room = injectRoom<TPresence>();
  const engine = room.useRecording();
  const initialState = engine.getState();
  const isRecording = signal(initialState.isRecording);
  const frameCount = signal(initialState.frameCount);
  const durationMs = signal(initialState.durationMs);

  const unsubscribe: Unsubscribe = engine.subscribe((state) => {
    isRecording.set(state.isRecording);
    frameCount.set(state.frameCount);
    durationMs.set(state.durationMs);
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    isRecording,
    frameCount,
    durationMs,
    start: () => {
      engine.start();
    },
    stop: () => {
      engine.stop();
    },
    replay: (recording) => {
      return engine.replay(recording);
    },
    exportRecording: () => {
      return engine.export();
    },
  };
}

/**
 * Subscribes to the resolved state of a single lock key (the lock-on-focus
 * pattern: read `holder` to decide whether the local peer owns the key).
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @param key - The lock key to observe.
 * @returns The current lock state signal, resolving to `null` when free.
 */
export function injectLockState<TPresence extends PresenceData = PresenceData>(
  key: string,
): Signal<LockState | null> {
  assertInInjectionContext(injectLockState);
  const room = injectRoom<TPresence>();
  const lockEngine = room.useLocks();
  const cacheRef: { current: LockStateSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const state = signal(readLockStateSnapshot(room, lockEngine, key, cacheRef));

  const unsubscribe = lockEngine.subscribe(key, (lockState) => {
    state.set(reconcileLockStateSnapshot(room, lockEngine, key, lockState, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return state;
}

/**
 * Subscribes to awareness snapshots.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns Remote awareness state signal and local awareness mutators.
 */
export function injectAwareness<
  TPresence extends PresenceData = PresenceData,
>(): InjectAwarenessResult {
  assertInInjectionContext(injectAwareness);
  const room = injectRoom<TPresence>();
  const awareness = room.useAwareness();
  const cacheRef: { current: AwarenessSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const others = signal(readAwarenessSnapshot(room, awareness, cacheRef));

  const unsubscribe = awareness.subscribe(() => {
    others.set(readAwarenessSnapshot(room, awareness, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return {
    others,
    set: (value) => {
      awareness.set(value);
    },
    setFocus: (elementId) => {
      awareness.setFocus(elementId);
    },
    setSelection: (selection) => {
      awareness.setSelection(selection);
    },
    setTyping: (isTyping) => {
      awareness.setTyping(isTyping);
    },
  };
}

/**
 * Subscribes to a custom event channel and returns an emitter for that channel.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPayload - The payload type for the channel.
 * @typeParam TPresence - The room presence shape.
 * @param name - The custom event channel name.
 * @param handler - The callback invoked for incoming events.
 * @returns A function that emits payloads on the same channel.
 */
export function injectEvent<TPayload = unknown, TPresence extends PresenceData = PresenceData>(
  name: string,
  handler: EventHandlerRef<TPayload, TPresence>,
): (payload: TPayload) => void {
  assertInInjectionContext(injectEvent);
  const room = injectRoom<TPresence>();
  const boundHandler: EventHandlerRef<unknown, TPresence> = handler;

  const unsubscribe = room.useEvents().on(name, (payload, from) => {
    boundHandler(payload, from);
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return (payload: TPayload): void => {
    room.useEvents().emit(name, payload);
  };
}

/**
 * Subscribes to the full remote peer list for the current room.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The latest remote peer list signal.
 */
export function injectPeers<TPresence extends PresenceData = PresenceData>(): Signal<
  Peer<TPresence>[]
> {
  assertInInjectionContext(injectPeers);
  const room = injectRoom<TPresence>();
  const presence = room.usePresence();
  const cacheRef: { current: PeerSnapshotCache<TPresence> | null } = {
    current: null,
  };
  const peers = signal(readPeersSnapshot(room, presence, cacheRef));

  const unsubscribe = presence.subscribe(() => {
    peers.set(readPeersSnapshot(room, presence, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  return peers;
}

/**
 * Subscribes to the current room connection status.
 *
 * Must be called in an injection context.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The latest connection status signal.
 */
export function injectConnectionStatus<
  TPresence extends PresenceData = PresenceData,
>(): Signal<RoomStatus> {
  assertInInjectionContext(injectConnectionStatus);
  const room = injectRoom<TPresence>();
  const status = signal<RoomStatus>(room.status);

  const sync = (): void => {
    status.set(room.status);
  };

  const unsubscribeConnected = room.on('connected', sync);
  const unsubscribeReconnecting = room.on('reconnecting', sync);
  const unsubscribeDisconnected = room.on('disconnected', sync);
  const unsubscribeError = room.on('error', sync);

  sync();

  inject(DestroyRef).onDestroy(() => {
    unsubscribeError();
    unsubscribeDisconnected();
    unsubscribeReconnecting();
    unsubscribeConnected();
  });

  return status;
}

/**
 * Binds a shared state value to Angular signal semantics.
 *
 * Must be called in an injection context. Enforces a single shared-state
 * binding per room: a second `injectSharedState` for the same room must use the
 * same key and compatible options.
 *
 * @typeParam T - The shared state value type.
 * @typeParam TPresence - The room presence shape.
 * @param key - The logical binding key used to enforce a single shared-state binding per room.
 * @param options - The shared-state configuration.
 * @returns The current shared state signal and a React-style setter.
 */
export function injectSharedState<T, TPresence extends PresenceData = PresenceData>(
  key: string,
  options: StateOptions<T>,
): readonly [Signal<T>, SharedStateSetter<T>] {
  assertInInjectionContext(injectSharedState);
  const room = injectRoom<TPresence>();
  const existingBinding = sharedStateBindings.get(room) ?? null;

  if (existingBinding !== null) {
    assertCompatibleSharedStateBinding(existingBinding, key, options, {
      method: 'injectSharedState',
      container: 'room',
    });
  }

  const state = room.useState(options);
  const binding = existingBinding ?? createSharedStateBinding(key, options);
  sharedStateBindings.set(room, binding);

  if (binding.persist !== true && options.persist === true && binding.strategy === 'lww') {
    binding.persist = true;
  }

  const cacheRef: { current: SharedStateSnapshotCache<TPresence, T> | null } = {
    current: null,
  };
  const value = signal(readSharedStateSnapshot(room, state, cacheRef));

  const unsubscribe = state.subscribe(() => {
    value.set(readSharedStateSnapshot(room, state, cacheRef));
  });

  inject(DestroyRef).onDestroy(unsubscribe);

  const setSharedValue: SharedStateSetter<T> = (nextValue) => {
    const previousValue = state.get();
    const resolvedValue = isStateUpdater(nextValue) ? nextValue(previousValue) : nextValue;

    if (areStructuredValuesEqual(previousValue, resolvedValue)) {
      return previousValue;
    }

    state.set(resolvedValue);
    value.set(resolvedValue);
    return resolvedValue;
  };

  return [value, setSharedValue] as const;
}

function createRoomOptions<TPresence extends PresenceData = PresenceData>(
  source: RoomfulProviderOptions<TPresence>,
): RoomOptions<TPresence> {
  const options: RoomOptions<TPresence> = {};

  if (source.transport !== undefined) {
    options.transport = source.transport;
  }

  if (source.presence !== undefined) {
    options.presence = source.presence;
  }

  if (source.maxPeers !== undefined) {
    options.maxPeers = source.maxPeers;
  }

  if (source.stunUrls !== undefined) {
    options.stunUrls = source.stunUrls;
  }

  if (source.relayUrl !== undefined) {
    options.relayUrl = source.relayUrl;
  }

  if (source.relayAuth !== undefined) {
    options.relayAuth = source.relayAuth;
  }

  if (source.reconnect !== undefined) {
    options.reconnect = source.reconnect;
  }

  if (source.webrtc !== undefined) {
    options.webrtc = source.webrtc;
  }

  if (source.websocket !== undefined) {
    options.websocket = source.websocket;
  }

  if (source.encryption !== undefined) {
    options.encryption = source.encryption;
  }

  if (source.debug !== undefined) {
    options.debug = source.debug;
  }

  return options;
}

function readPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: { current: PresenceSnapshotCache<TPresence> | null },
): PresenceSnapshot<TPresence> {
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

    const nextSnapshot: PresenceSnapshot<TPresence> = {
      self: isSelfEqual ? previousSnapshot.self : self,
      others: isOthersEqual ? previousSnapshot.others : others,
      all: isAllEqual ? previousSnapshot.all : all,
    };

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  const snapshot: PresenceSnapshot<TPresence> = {
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

function readPeersSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: { current: PeerSnapshotCache<TPresence> | null },
): Peer<TPresence>[] {
  const nextSnapshot = room.peers;
  const previous = cacheRef.current;

  if (previous !== null && previous.room === room && previous.engine === presence) {
    const previousSnapshot = previous.snapshot;
    if (arePeerArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((peer, index) => {
      const previousPeer = previousSnapshot[index];
      if (previousPeer !== undefined && arePeersEqual(previousPeer, peer)) {
        return previousPeer;
      }

      return peer;
    });
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    engine: presence,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
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

function isStateUpdater<T>(value: SetStateAction<T>): value is (previous: T) => T {
  return typeof value === 'function';
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
