import type {
  ActivityEngine,
  ActivityEntry,
  ActivityOptions,
  AgentApprovalEngine,
  AgentApprovalOptions,
  AgentProposal,
  AwarenessEngine,
  AwarenessState,
  CommentsEngine,
  CommentsOptions,
  CommentThread,
  CursorData,
  CursorEngine,
  CursorOptions,
  CursorPosition,
  FieldPresenceEngine,
  FieldPresenceState,
  HistoryEngine,
  HistoryOptions,
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
import type { Dispatch, ReactNode, RefCallback, SetStateAction } from 'react';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';

/**
 * Configures the React provider.
 *
 * @typeParam TPresence - The room presence shape inferred from `presence`.
 */
export interface RoomfulProviderProps<
  TPresence extends PresenceData = PresenceData,
> extends RoomOptions<TPresence> {
  /**
   * Identifies the room to create or join.
   */
  roomId: string;

  /**
   * Renders the provider subtree.
   */
  children?: ReactNode;

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
 * Describes the return value of `usePresence`.
 *
 * @typeParam TPresence - The room presence shape.
 */
export interface UsePresenceResult<TPresence extends PresenceData = PresenceData> {
  /**
   * Exposes the local peer snapshot.
   */
  self: Peer<TPresence>;

  /**
   * Exposes remote peers only.
   */
  others: Peer<TPresence>[];

  /**
   * Exposes local and remote peers.
   */
  all: Peer<TPresence>[];

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
   * Callback ref that mounts the cursor engine on an element.
   */
  ref: RefCallback<HTMLElement>;

  /**
   * Exposes the latest cursor positions.
   */
  cursors: CursorPosition<TCursor>[];

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
 * Describes the return value of `useAwareness`.
 */
export interface UseAwarenessResult {
  /**
   * Exposes remote awareness state only.
   */
  others: AwarenessState[];

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
 * Describes the return value of `useViewport`.
 */
export interface UseViewportResult {
  /**
   * Callback ref that mounts the viewport engine on a scrollable container.
   */
  ref: RefCallback<HTMLElement>;

  /**
   * Exposes remote peer viewport states only.
   */
  states: ViewportState[];

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
   * Callback ref that mounts the pointer engine on a container element.
   */
  ref: RefCallback<HTMLElement>;

  /**
   * Exposes remote peers' pointer beams only.
   */
  beams: PointerBeam[];

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
 * Describes the return value of `useLocks`.
 */
export interface UseLocksResult {
  /**
   * Exposes the resolved state of every currently-held lock.
   */
  locks: LockState[];

  /**
   * Claims exclusive ownership of a key, resolving whether the local peer holds
   * it.
   */
  acquire: LockEngine['acquire'];

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
   * Exposes the current comment threads, oldest first. Reactive: re-renders on
   * any local or remote thread change.
   */
  threads: CommentThread[];

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
   * The activity feed, newest first. Reactive: re-renders on any local or remote entry.
   */
  entries: ActivityEntry[];

  /**
   * Records an activity entry and broadcasts it to peers.
   */
  record: ActivityEngine['record'];
}

/**
 * Describes the return value of `useAgentApprovals`.
 */
export interface UseAgentApprovalsResult {
  /**
   * Every proposal, newest first. Reactive: re-renders on any local or remote change.
   */
  proposals: AgentProposal[];

  /**
   * The proposals still awaiting a decision, newest first.
   */
  pending: AgentProposal[];

  /**
   * Approves a pending proposal (if permitted) and broadcasts the decision.
   */
  approve: AgentApprovalEngine['approve'];

  /**
   * Rejects a pending proposal (if permitted) and broadcasts the decision.
   */
  reject: AgentApprovalEngine['reject'];

  /**
   * Proposes an action for approval and broadcasts it as pending.
   */
  propose: AgentApprovalEngine['propose'];
}

/**
 * Describes the return value of `useFieldPresence`.
 */
export interface UseFieldPresenceResult {
  /**
   * Every field with at least one remote peer, ordered by field id. Reactive: re-renders when peers
   * enter or leave a field.
   */
  fields: FieldPresenceState[];

  /**
   * Declares the field the local peer is active on, or `null` to clear it. Stable across renders.
   */
  setActiveField: FieldPresenceEngine['setActiveField'];

  /**
   * Returns the remote peers on a field from the current snapshot.
   */
  getFieldPeers(fieldId: string): Peer[];
}

/**
 * Describes the return value of `useHistory`.
 */
export interface UseHistoryResult {
  /**
   * Exposes the shared timeline of every peer's entries, oldest first.
   * Reactive: re-renders on any local or remote timeline change.
   */
  timeline: TimelineEntry[];

  /**
   * Reports whether the local peer has a tracked transaction to undo. Reactive.
   */
  canUndo: boolean;

  /**
   * Reports whether the local peer has an undone transaction to redo. Reactive.
   */
  canRedo: boolean;

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
   * Whether the recorder is currently capturing wire signals. Reactive.
   */
  isRecording: boolean;

  /**
   * How many signals the current take has captured. Reactive: increments as
   * traffic flows while recording.
   */
  frameCount: number;

  /**
   * The span of the current take in milliseconds. Reactive.
   */
  durationMs: number;

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
  onError: ((error: RoomfulError) => void) | undefined;
}

interface PresenceSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: UsePresenceResult<TPresence>;
}

interface CursorSnapshotCache<TPresence extends PresenceData, TCursor extends CursorData> {
  room: Room<TPresence>;
  engine: CursorEngine<TCursor>;
  snapshot: CursorPosition<TCursor>[];
}

interface AwarenessSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: AwarenessEngine;
  snapshot: UseAwarenessResult;
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

interface CommentsSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: CommentsEngine;
  snapshot: CommentThread[];
}

interface HistorySnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: HistoryEngine;
  snapshot: UseHistoryResult;
}

interface RecordingSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: RecordingEngine;
  snapshot: UseRecordingResult;
}

interface PeerSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: PresenceEngine<TPresence>;
  snapshot: Peer<TPresence>[];
}

interface ConnectionStatusSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  snapshot: RoomStatus;
}

type EventHandlerRef<TPayload, TPresence extends PresenceData> = {
  bivarianceHack(payload: TPayload, from: Peer<TPresence>): void;
}['bivarianceHack'];

interface SharedStateSnapshotCache<TPresence extends PresenceData, T> {
  room: Room<TPresence>;
  engine: StateEngine<T>;
  snapshot: T;
}

const sharedStateBindings = new WeakMap<Room<PresenceData>, SharedStateBinding>();

const RoomfulRoomContext = createContext<unknown>(null);
RoomfulRoomContext.displayName = 'RoomfulRoomContext';

/**
 * Creates a room and provides it to the React subtree.
 *
 * @typeParam TPresence - The room presence shape inferred from `props.presence`.
 * @param props - The provider configuration and children.
 * @returns The provider element.
 */
export function RoomfulProvider<TPresence extends PresenceData = PresenceData>(
  props: RoomfulProviderProps<TPresence>,
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

  return createElement(RoomfulRoomContext.Provider, { value: room }, props.children);
}

/**
 * Returns the current room from `RoomfulProvider`.
 *
 * @typeParam TPresence - The room presence shape to project onto the room.
 * @returns The current room instance.
 * @throws {RoomfulError} When called outside `RoomfulProvider`.
 */
export function useRoom<TPresence extends PresenceData = PresenceData>(): Room<TPresence> {
  const room = useContext(RoomfulRoomContext);

  if (!isRoom<TPresence>(room)) {
    throw new RoomfulError(
      'INVALID_STATE',
      'useRoom() must be used within a RoomfulProvider.',
      false,
    );
  }

  return room;
}

/**
 * Subscribes to room presence snapshots.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The local peer, remote peers, and presence mutators.
 */
export function usePresence<
  TPresence extends PresenceData = PresenceData,
>(): UsePresenceResult<TPresence> {
  const room = useRoom<TPresence>();
  const presence = room.usePresence();
  const snapshotCacheRef = useRef<PresenceSnapshotCache<TPresence> | null>(null);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return presence.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readPresenceSnapshot(room, presence, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [presence, room],
  );
  const getSnapshot = useCallback(() => {
    return readPresenceSnapshot(room, presence, snapshotCacheRef);
  }, [presence, room]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
  const room = useRoom<TPresence>();
  const optionsRef = useRef(options);
  const cursorEngine = room.useCursors<TCursor>(optionsRef.current);
  const snapshotCacheRef = useRef<CursorSnapshotCache<TPresence, TCursor> | null>(null);
  const trackedElementRef = useRef<HTMLElement | null>(null);
  const mountedEngineRef = useRef<CursorEngine<TCursor> | null>(null);

  const mount = useCallback(
    (element: HTMLElement) => {
      const previousElement = trackedElementRef.current;
      trackedElementRef.current = element;

      if (mountedEngineRef.current === cursorEngine && previousElement === element) {
        return;
      }

      mountedEngineRef.current?.unmount();
      cursorEngine.mount(element);
      mountedEngineRef.current = cursorEngine;
    },
    [cursorEngine],
  );

  const unmount = useCallback(() => {
    trackedElementRef.current = null;
    mountedEngineRef.current?.unmount();
    mountedEngineRef.current = null;
  }, []);

  const ref = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) {
        unmount();
        return;
      }

      mount(element);
    },
    [mount, unmount],
  );

  useEffect(() => {
    const trackedElement = trackedElementRef.current;
    if (trackedElement && mountedEngineRef.current !== cursorEngine) {
      mountedEngineRef.current?.unmount();
      cursorEngine.mount(trackedElement);
      mountedEngineRef.current = cursorEngine;
    }
  }, [cursorEngine]);

  useEffect(() => {
    return () => {
      trackedElementRef.current = null;
      mountedEngineRef.current?.unmount();
      mountedEngineRef.current = null;
    };
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return cursorEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readCursorSnapshot(room, cursorEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [cursorEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readCursorSnapshot(room, cursorEngine, snapshotCacheRef);
  }, [cursorEngine, room]);

  return {
    ref,
    cursors: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    mount,
    unmount,
  };
}

/**
 * Subscribes to awareness snapshots.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns Remote awareness state and local awareness mutators.
 */
export function useAwareness<TPresence extends PresenceData = PresenceData>(): UseAwarenessResult {
  const room = useRoom<TPresence>();
  const awareness = room.useAwareness();
  const awarenessRef = useRef(awareness);
  awarenessRef.current = awareness;

  const set = useCallback<AwarenessEngine['set']>((value) => {
    awarenessRef.current.set(value);
  }, []);
  const setFocus = useCallback<AwarenessEngine['setFocus']>((elementId) => {
    awarenessRef.current.setFocus(elementId);
  }, []);
  const setSelection = useCallback<AwarenessEngine['setSelection']>((selection) => {
    awarenessRef.current.setSelection(selection);
  }, []);
  const setTyping = useCallback<AwarenessEngine['setTyping']>((isTyping) => {
    awarenessRef.current.setTyping(isTyping);
  }, []);

  const snapshotCacheRef = useRef<AwarenessSnapshotCache<TPresence> | null>(null);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return awareness.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readAwarenessSnapshot(room, awareness, snapshotCacheRef, {
          set,
          setFocus,
          setSelection,
          setTyping,
        });
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [awareness, room, set, setFocus, setSelection, setTyping],
  );
  const getSnapshot = useCallback(() => {
    return readAwarenessSnapshot(room, awareness, snapshotCacheRef, {
      set,
      setFocus,
      setSelection,
      setTyping,
    });
  }, [awareness, room, set, setFocus, setSelection, setTyping]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
  const room = useRoom<TPresence>();
  const optionsRef = useRef(options);
  const viewportEngine = room.useViewport(optionsRef.current);
  const engineRef = useRef(viewportEngine);
  engineRef.current = viewportEngine;

  const snapshotCacheRef = useRef<ViewportSnapshotCache<TPresence> | null>(null);
  const trackedElementRef = useRef<HTMLElement | null>(null);
  const mountedEngineRef = useRef<ViewportEngine | null>(null);

  const mount = useCallback(
    (element: HTMLElement) => {
      const previousElement = trackedElementRef.current;
      trackedElementRef.current = element;

      if (mountedEngineRef.current === viewportEngine && previousElement === element) {
        return;
      }

      mountedEngineRef.current?.unmount();
      viewportEngine.mount(element);
      mountedEngineRef.current = viewportEngine;
    },
    [viewportEngine],
  );

  const unmount = useCallback(() => {
    trackedElementRef.current = null;
    mountedEngineRef.current?.unmount();
    mountedEngineRef.current = null;
  }, []);

  const ref = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) {
        unmount();
        return;
      }

      mount(element);
    },
    [mount, unmount],
  );

  useEffect(() => {
    const trackedElement = trackedElementRef.current;
    if (trackedElement && mountedEngineRef.current !== viewportEngine) {
      mountedEngineRef.current?.unmount();
      viewportEngine.mount(trackedElement);
      mountedEngineRef.current = viewportEngine;
    }
  }, [viewportEngine]);

  useEffect(() => {
    return () => {
      trackedElementRef.current = null;
      mountedEngineRef.current?.unmount();
      mountedEngineRef.current = null;
    };
  }, []);

  const broadcast = useCallback<ViewportEngine['broadcast']>(() => {
    engineRef.current.broadcast();
  }, []);
  const stopBroadcast = useCallback<ViewportEngine['stopBroadcast']>(() => {
    engineRef.current.stopBroadcast();
  }, []);
  const present = useCallback<ViewportEngine['present']>(() => {
    engineRef.current.present();
  }, []);
  const stopPresenting = useCallback<ViewportEngine['stopPresenting']>(() => {
    engineRef.current.stopPresenting();
  }, []);
  const follow = useCallback<ViewportEngine['follow']>((peerId) => {
    engineRef.current.follow(peerId);
  }, []);
  const unfollow = useCallback<ViewportEngine['unfollow']>(() => {
    engineRef.current.unfollow();
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return viewportEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readViewportSnapshot(room, viewportEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [room, viewportEngine],
  );
  const getSnapshot = useCallback(() => {
    return readViewportSnapshot(room, viewportEngine, snapshotCacheRef);
  }, [room, viewportEngine]);

  return {
    ref,
    states: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    broadcast,
    stopBroadcast,
    present,
    stopPresenting,
    follow,
    unfollow,
  };
}

/**
 * Subscribes to remote pointer beams and returns mounting plus control helpers.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional pointer tracking configuration.
 * @returns The remote beams plus a mounting ref and activate/deactivate/render controls.
 */
export function usePointer<TPresence extends PresenceData = PresenceData>(
  options?: PointerOptions,
): UsePointerResult {
  const room = useRoom<TPresence>();
  const optionsRef = useRef(options);
  const pointerEngine = room.usePointer(optionsRef.current);
  const engineRef = useRef(pointerEngine);
  engineRef.current = pointerEngine;

  const snapshotCacheRef = useRef<PointerSnapshotCache<TPresence> | null>(null);
  const trackedElementRef = useRef<HTMLElement | null>(null);
  const mountedEngineRef = useRef<PointerEngine | null>(null);

  const mount = useCallback(
    (element: HTMLElement) => {
      const previousElement = trackedElementRef.current;
      trackedElementRef.current = element;

      if (mountedEngineRef.current === pointerEngine && previousElement === element) {
        return;
      }

      mountedEngineRef.current?.unmount();
      pointerEngine.mount(element);
      mountedEngineRef.current = pointerEngine;
    },
    [pointerEngine],
  );

  const unmount = useCallback(() => {
    trackedElementRef.current = null;
    mountedEngineRef.current?.unmount();
    mountedEngineRef.current = null;
  }, []);

  const ref = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      if (element === null) {
        unmount();
        return;
      }

      mount(element);
    },
    [mount, unmount],
  );

  useEffect(() => {
    const trackedElement = trackedElementRef.current;
    if (trackedElement && mountedEngineRef.current !== pointerEngine) {
      mountedEngineRef.current?.unmount();
      pointerEngine.mount(trackedElement);
      mountedEngineRef.current = pointerEngine;
    }
  }, [pointerEngine]);

  useEffect(() => {
    return () => {
      trackedElementRef.current = null;
      mountedEngineRef.current?.unmount();
      mountedEngineRef.current = null;
    };
  }, []);

  const activate = useCallback<PointerEngine['activate']>(() => {
    engineRef.current.activate();
  }, []);
  const deactivate = useCallback<PointerEngine['deactivate']>(() => {
    engineRef.current.deactivate();
  }, []);
  const render = useCallback<PointerEngine['render']>((renderOptions) => {
    return engineRef.current.render(renderOptions);
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return pointerEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readPointerSnapshot(room, pointerEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [pointerEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readPointerSnapshot(room, pointerEngine, snapshotCacheRef);
  }, [pointerEngine, room]);

  return {
    ref,
    beams: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    activate,
    deactivate,
    render,
  };
}

/**
 * Subscribes to all lock states and returns the lock engine controls.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The held lock states plus acquire/release controls.
 */
export function useLocks<TPresence extends PresenceData = PresenceData>(): UseLocksResult {
  const room = useRoom<TPresence>();
  const lockEngine = room.useLocks();
  const engineRef = useRef(lockEngine);
  engineRef.current = lockEngine;

  const snapshotCacheRef = useRef<LocksSnapshotCache<TPresence> | null>(null);

  const acquire = useCallback<LockEngine['acquire']>((key, options) => {
    return engineRef.current.acquire(key, options);
  }, []);
  const release = useCallback<LockEngine['release']>((key) => {
    engineRef.current.release(key);
  }, []);
  const releaseAll = useCallback<LockEngine['releaseAll']>(() => {
    engineRef.current.releaseAll();
  }, []);
  const isLocked = useCallback<LockEngine['isLocked']>((key) => {
    return engineRef.current.isLocked(key);
  }, []);
  const getHolder = useCallback<LockEngine['getHolder']>((key) => {
    return engineRef.current.getHolder(key);
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return lockEngine.subscribeAll(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readLocksSnapshot(room, lockEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [lockEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readLocksSnapshot(room, lockEngine, snapshotCacheRef);
  }, [lockEngine, room]);

  return {
    locks: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    acquire,
    release,
    releaseAll,
    isLocked,
    getHolder,
  };
}

/**
 * Subscribes to the resolved state of a single lock key (the lock-on-focus
 * pattern: read `holder` to decide whether the local peer owns the key).
 *
 * @typeParam TPresence - The room presence shape.
 * @param key - The lock key to observe.
 * @returns The current lock state for the key, or `null` when it is free.
 */
export function useLockState<TPresence extends PresenceData = PresenceData>(
  key: string,
): LockState | null {
  const room = useRoom<TPresence>();
  const lockEngine = room.useLocks();
  const snapshotCacheRef = useRef<LockStateSnapshotCache<TPresence> | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return lockEngine.subscribe(key, (state) => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = reconcileLockStateSnapshot(
          room,
          lockEngine,
          key,
          state,
          snapshotCacheRef,
        );
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [key, lockEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readLockStateSnapshot(room, lockEngine, key, snapshotCacheRef);
  }, [key, lockEngine, room]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribes to collaborative comment threads and returns the thread mutators.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional storage backend configuration.
 * @returns The current threads plus add/reply/resolve/reopen and filter helpers.
 */
export function useComments<TPresence extends PresenceData = PresenceData>(
  options?: CommentsOptions,
): UseCommentsResult {
  const room = useRoom<TPresence>();
  const optionsRef = useRef(options);
  const commentsEngine = room.useComments(optionsRef.current);
  const engineRef = useRef(commentsEngine);
  engineRef.current = commentsEngine;

  const snapshotCacheRef = useRef<CommentsSnapshotCache<TPresence> | null>(null);

  const add = useCallback<CommentsEngine['add']>((input) => {
    return engineRef.current.add(input);
  }, []);
  const reply = useCallback((threadId: string, text: string) => {
    return engineRef.current.thread(threadId).reply(text);
  }, []);
  const resolve = useCallback((threadId: string) => {
    return engineRef.current.thread(threadId).resolve();
  }, []);
  const reopen = useCallback((threadId: string) => {
    return engineRef.current.thread(threadId).reopen();
  }, []);
  const getByElement = useCallback<CommentsEngine['getByElement']>((elementId) => {
    return engineRef.current.getByElement(elementId);
  }, []);
  const getOpen = useCallback<CommentsEngine['getOpen']>(() => {
    return engineRef.current.getOpen();
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return commentsEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readCommentsSnapshot(room, commentsEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [commentsEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readCommentsSnapshot(room, commentsEngine, snapshotCacheRef);
  }, [commentsEngine, room]);

  return {
    threads: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    add,
    reply,
    resolve,
    reopen,
    getByElement,
    getOpen,
  };
}

interface ActivitySnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: ActivityEngine;
  snapshot: ActivityEntry[];
}

function areActivityEntryArraysEqual(previous: ActivityEntry[], next: ActivityEntry[]): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (!areStructuredValuesEqual(previous[index], next[index])) {
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

  if (previous && previous.room === room && previous.engine === activity) {
    if (areActivityEntryArraysEqual(previous.snapshot, nextSnapshot)) {
      return previous.snapshot;
    }

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  cacheRef.current = {
    room,
    engine: activity,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

/**
 * Subscribes to the room activity feed and returns it newest-first, plus a `record` function.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional feed configuration (retention limit).
 * @returns The reactive activity feed and recorder.
 */
export function useActivity<TPresence extends PresenceData = PresenceData>(
  options?: ActivityOptions,
): UseActivityResult {
  const room = useRoom<TPresence>();
  const optionsRef = useRef(options);
  const activityEngine = room.useActivity(optionsRef.current);
  const engineRef = useRef(activityEngine);
  engineRef.current = activityEngine;

  const snapshotCacheRef = useRef<ActivitySnapshotCache<TPresence> | null>(null);

  const record = useCallback<ActivityEngine['record']>((type, data) => {
    return engineRef.current.record(type, data);
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return activityEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readActivitySnapshot(room, activityEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [activityEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readActivitySnapshot(room, activityEngine, snapshotCacheRef);
  }, [activityEngine, room]);

  return {
    entries: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    record,
  };
}

interface AgentApprovalsSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: AgentApprovalEngine;
  snapshot: AgentProposal[];
}

function areProposalArraysEqual(previous: AgentProposal[], next: AgentProposal[]): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (!areStructuredValuesEqual(previous[index], next[index])) {
      return false;
    }
  }

  return true;
}

function readApprovalsSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  approvals: AgentApprovalEngine,
  cacheRef: { current: AgentApprovalsSnapshotCache<TPresence> | null },
): AgentProposal[] {
  const nextSnapshot = approvals.getProposals();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === approvals) {
    if (areProposalArraysEqual(previous.snapshot, nextSnapshot)) {
      return previous.snapshot;
    }

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  cacheRef.current = {
    room,
    engine: approvals,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

/**
 * Subscribes to the room's agent-approval workflow: agents propose actions and humans approve or
 * reject them. Returns the proposal list (all + pending, newest first) and the decision actions.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional configuration (permission hook).
 * @returns The reactive proposals plus `approve`/`reject`/`propose`.
 */
export function useAgentApprovals<TPresence extends PresenceData = PresenceData>(
  options?: AgentApprovalOptions,
): UseAgentApprovalsResult {
  const room = useRoom<TPresence>();
  const optionsRef = useRef(options);
  const approvalsEngine = room.useAgentApprovals(optionsRef.current);
  const engineRef = useRef(approvalsEngine);
  engineRef.current = approvalsEngine;

  const snapshotCacheRef = useRef<AgentApprovalsSnapshotCache<TPresence> | null>(null);

  const approve = useCallback<AgentApprovalEngine['approve']>((id) => {
    engineRef.current.approve(id);
  }, []);
  const reject = useCallback<AgentApprovalEngine['reject']>((id) => {
    engineRef.current.reject(id);
  }, []);
  const propose = useCallback<AgentApprovalEngine['propose']>((input) => {
    return engineRef.current.propose(input);
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return approvalsEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readApprovalsSnapshot(room, approvalsEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [approvalsEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readApprovalsSnapshot(room, approvalsEngine, snapshotCacheRef);
  }, [approvalsEngine, room]);

  const proposals = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    proposals,
    pending: proposals.filter((proposal) => proposal.status === 'pending'),
    approve,
    reject,
    propose,
  };
}

interface FieldPresenceSnapshotCache<TPresence extends PresenceData> {
  room: Room<TPresence>;
  engine: FieldPresenceEngine;
  snapshot: FieldPresenceState[];
}

function areFieldPresenceArraysEqual(
  previous: FieldPresenceState[],
  next: FieldPresenceState[],
): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (!areStructuredValuesEqual(previous[index], next[index])) {
      return false;
    }
  }

  return true;
}

function readFieldPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  fieldPresence: FieldPresenceEngine,
  cacheRef: { current: FieldPresenceSnapshotCache<TPresence> | null },
): FieldPresenceState[] {
  const nextSnapshot = fieldPresence.getActiveFields();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === fieldPresence) {
    if (areFieldPresenceArraysEqual(previous.snapshot, nextSnapshot)) {
      return previous.snapshot;
    }

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  cacheRef.current = {
    room,
    engine: fieldPresence,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

/**
 * Subscribes to field presence: which remote peers are active on which field. Declare the local
 * peer's field with `setActiveField` (e.g. on input focus) and read `getFieldPeers(id)` to render
 * "who else is editing this" avatars. Purpose-built for collaborative forms, tables, and records.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The reactive active fields plus `setActiveField` and `getFieldPeers`.
 */
export function useFieldPresence<
  TPresence extends PresenceData = PresenceData,
>(): UseFieldPresenceResult {
  const room = useRoom<TPresence>();
  const fieldPresenceEngine = room.useFieldPresence();
  const engineRef = useRef(fieldPresenceEngine);
  engineRef.current = fieldPresenceEngine;

  const snapshotCacheRef = useRef<FieldPresenceSnapshotCache<TPresence> | null>(null);

  const setActiveField = useCallback<FieldPresenceEngine['setActiveField']>((fieldId) => {
    engineRef.current.setActiveField(fieldId);
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return fieldPresenceEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readFieldPresenceSnapshot(room, fieldPresenceEngine, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [fieldPresenceEngine, room],
  );
  const getSnapshot = useCallback(() => {
    return readFieldPresenceSnapshot(room, fieldPresenceEngine, snapshotCacheRef);
  }, [fieldPresenceEngine, room]);

  const fields = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const getFieldPeers = useCallback(
    (fieldId: string): Peer[] => {
      return fields.find((field) => field.fieldId === fieldId)?.peers ?? [];
    },
    [fields],
  );

  return {
    fields,
    setActiveField,
    getFieldPeers,
  };
}

/**
 * Subscribes to the collaborative history engine: a reactive shared timeline
 * plus reactive `canUndo`/`canRedo`, with stable capture/transaction/undo/redo
 * controls.
 *
 * @typeParam TPresence - The room presence shape.
 * @param options - Optional history configuration.
 * @returns The timeline, undo/redo availability, and history controls.
 */
export function useHistory<TPresence extends PresenceData = PresenceData>(
  options?: HistoryOptions,
): UseHistoryResult {
  const room = useRoom<TPresence>();
  const optionsRef = useRef(options);
  const historyEngine = room.useHistory(optionsRef.current);
  const engineRef = useRef(historyEngine);
  engineRef.current = historyEngine;

  const snapshotCacheRef = useRef<HistorySnapshotCache<TPresence> | null>(null);

  const capture = useCallback<HistoryEngine['capture']>((action, payload) => {
    engineRef.current.capture(action, payload);
  }, []);
  const transaction = useCallback<HistoryEngine['transaction']>((name, fn) => {
    engineRef.current.transaction(name, fn);
  }, []);
  const undo = useCallback<HistoryEngine['undo']>(() => {
    return engineRef.current.undo();
  }, []);
  const redo = useCallback<HistoryEngine['redo']>(() => {
    return engineRef.current.redo();
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return historyEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readHistorySnapshot(room, historyEngine, snapshotCacheRef, {
          capture,
          transaction,
          undo,
          redo,
        });
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [capture, historyEngine, redo, room, transaction, undo],
  );
  const getSnapshot = useCallback(() => {
    return readHistorySnapshot(room, historyEngine, snapshotCacheRef, {
      capture,
      transaction,
      undo,
      redo,
    });
  }, [capture, historyEngine, redo, room, transaction, undo]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribes to the session-recording engine: reactive `isRecording`,
 * `frameCount`, and `durationMs`, with stable start/stop/replay/export controls.
 * Capture is local to this peer; replay re-emits the captured frames at their
 * original tempo.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The recorder state and controls.
 */
export function useRecording<TPresence extends PresenceData = PresenceData>(): UseRecordingResult {
  const room = useRoom<TPresence>();
  const recordingEngine = room.useRecording();
  const engineRef = useRef(recordingEngine);
  engineRef.current = recordingEngine;

  const snapshotCacheRef = useRef<RecordingSnapshotCache<TPresence> | null>(null);

  const start = useCallback<RecordingEngine['start']>(() => {
    engineRef.current.start();
  }, []);
  const stop = useCallback<RecordingEngine['stop']>(() => {
    engineRef.current.stop();
  }, []);
  const replay = useCallback<RecordingEngine['replay']>((recording) => {
    return engineRef.current.replay(recording);
  }, []);
  const exportRecording = useCallback<RecordingEngine['export']>(() => {
    return engineRef.current.export();
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return recordingEngine.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readRecordingSnapshot(room, recordingEngine, snapshotCacheRef, {
          start,
          stop,
          replay,
          exportRecording,
        });
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [exportRecording, recordingEngine, replay, room, start, stop],
  );
  const getSnapshot = useCallback(() => {
    return readRecordingSnapshot(room, recordingEngine, snapshotCacheRef, {
      start,
      stop,
      replay,
      exportRecording,
    });
  }, [exportRecording, recordingEngine, replay, room, start, stop]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
  const room = useRoom<TPresence>();
  const roomRef = useRef(room);
  const nameRef = useRef(name);
  const handlerRef = useRef<EventHandlerRef<unknown, TPresence>>(handler);

  roomRef.current = room;
  nameRef.current = name;
  handlerRef.current = handler;

  const stableHandler = useCallback((payload: unknown, from: Peer<TPresence>) => {
    handlerRef.current(payload, from);
  }, []);

  useEffect(() => {
    return room.useEvents().on(name, stableHandler);
  }, [name, room, stableHandler]);

  return useCallback((payload: TPayload) => {
    roomRef.current.useEvents().emit(nameRef.current, payload);
  }, []);
}

/**
 * Subscribes to the full peer list for the current room.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The latest peer list.
 */
export function usePeers<TPresence extends PresenceData = PresenceData>(): Peer<TPresence>[] {
  const room = useRoom<TPresence>();
  const presence = room.usePresence();
  const snapshotCacheRef = useRef<PeerSnapshotCache<TPresence> | null>(null);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return presence.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readPeersSnapshot(room, presence, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [presence, room],
  );
  const getSnapshot = useCallback(() => {
    return readPeersSnapshot(room, presence, snapshotCacheRef);
  }, [presence, room]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribes to the current room connection status.
 *
 * @typeParam TPresence - The room presence shape.
 * @returns The latest connection status.
 */
export function useConnectionStatus<TPresence extends PresenceData = PresenceData>(): RoomStatus {
  const room = useRoom<TPresence>();
  const snapshotCacheRef = useRef<ConnectionStatusSnapshotCache<TPresence> | null>(null);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let cancelled = false;
      const notifyIfChanged = (): void => {
        if (cancelled) {
          return;
        }

        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readConnectionStatusSnapshot(room, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      };

      const unsubscribeConnected = room.on('connected', notifyIfChanged);
      const unsubscribeReconnecting = room.on('reconnecting', notifyIfChanged);
      const unsubscribeDisconnected = room.on('disconnected', notifyIfChanged);
      const unsubscribeError = room.on('error', notifyIfChanged);

      notifyIfChanged();
      void Promise.resolve().then(() => {
        notifyIfChanged();
      });

      return () => {
        cancelled = true;
        unsubscribeError();
        unsubscribeDisconnected();
        unsubscribeReconnecting();
        unsubscribeConnected();
      };
    },
    [room],
  );
  const getSnapshot = useCallback(() => {
    return readConnectionStatusSnapshot(room, snapshotCacheRef);
  }, [room]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Binds a shared state value to React state semantics.
 *
 * @typeParam T - The shared state value type.
 * @typeParam TPresence - The room presence shape.
 * @param key - The logical binding key used to enforce a single shared-state binding per room.
 * @param options - The shared-state configuration.
 * @returns The current shared state value and a React-style setter.
 */
export function useSharedState<T, TPresence extends PresenceData = PresenceData>(
  key: string,
  options: StateOptions<T>,
): readonly [T, Dispatch<SetStateAction<T>>] {
  const room = useRoom<TPresence>();
  const existingBinding = sharedStateBindings.get(room) ?? null;

  if (existingBinding) {
    assertCompatibleSharedStateBinding(existingBinding, key, options);
  }

  const state = room.useState(options);
  const binding = existingBinding ?? createSharedStateBinding(key, options);
  sharedStateBindings.set(room, binding);

  if (binding.persist !== true && options.persist === true && binding.strategy === 'lww') {
    binding.persist = true;
  }

  const stateRef = useRef(state);
  stateRef.current = state;

  const snapshotCacheRef = useRef<SharedStateSnapshotCache<TPresence, T> | null>(null);
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return state.subscribe(() => {
        const previousSnapshot = snapshotCacheRef.current?.snapshot ?? null;
        const nextSnapshot = readSharedStateSnapshot(room, state, snapshotCacheRef);
        if (nextSnapshot !== previousSnapshot) {
          onStoreChange();
        }
      });
    },
    [room, state],
  );
  const getSnapshot = useCallback(() => {
    return readSharedStateSnapshot(room, state, snapshotCacheRef);
  }, [room, state]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    const engine = stateRef.current;
    const previousValue = engine.get();
    const resolvedValue = isStateUpdater(nextValue) ? nextValue(previousValue) : nextValue;

    if (areStructuredValuesEqual(previousValue, resolvedValue)) {
      return;
    }

    engine.set(resolvedValue);
  }, []);

  return [useSyncExternalStore(subscribe, getSnapshot, getSnapshot), setValue] as const;
}

function createRoomDefinition<TPresence extends PresenceData = PresenceData>(
  props: RoomfulProviderProps<TPresence>,
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

  if (props.websocket !== undefined) {
    options.websocket = props.websocket;
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
    areShallowObjectsEqual(a.websocket, b.websocket) &&
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

function readAwarenessSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  awareness: AwarenessEngine,
  cacheRef: { current: AwarenessSnapshotCache<TPresence> | null },
  handlers: Omit<UseAwarenessResult, 'others'>,
): UseAwarenessResult {
  const nextOthers = awareness.getAll().filter((entry) => {
    return entry.peerId !== room.peerId;
  });
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === awareness) {
    const previousSnapshot = previous.snapshot;
    if (areAwarenessArraysEqual(previousSnapshot.others, nextOthers)) {
      return previousSnapshot;
    }

    previous.snapshot = {
      others: nextOthers.map((entry, index) => {
        const previousEntry = previousSnapshot.others[index];
        if (previousEntry && areStructuredValuesEqual(previousEntry, entry)) {
          return previousEntry;
        }

        return entry;
      }),
      set: previousSnapshot.set,
      setFocus: previousSnapshot.setFocus,
      setSelection: previousSnapshot.setSelection,
      setTyping: previousSnapshot.setTyping,
    };
    return previous.snapshot;
  }

  const snapshot: UseAwarenessResult = {
    others: nextOthers,
    set: handlers.set,
    setFocus: handlers.setFocus,
    setSelection: handlers.setSelection,
    setTyping: handlers.setTyping,
  };

  cacheRef.current = {
    room,
    engine: awareness,
    snapshot,
  };
  return snapshot;
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

  if (previous && previous.room === room && previous.engine === viewport) {
    const previousSnapshot = previous.snapshot;
    if (areViewportArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((state, index) => {
      const previousState = previousSnapshot[index];
      if (previousState && areStructuredValuesEqual(previousState, state)) {
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

  if (previous && previous.room === room && previous.engine === pointer) {
    const previousSnapshot = previous.snapshot;
    if (arePointerArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((beam, index) => {
      const previousBeam = previousSnapshot[index];
      if (previousBeam && areStructuredValuesEqual(previousBeam, beam)) {
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

  if (previous && previous.room === room && previous.engine === locks) {
    const previousSnapshot = previous.snapshot;
    if (areLockArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((state, index) => {
      const previousState = previousSnapshot[index];
      if (previousState && areStructuredValuesEqual(previousState, state)) {
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

  if (previous && previous.room === room && previous.engine === comments) {
    const previousSnapshot = previous.snapshot;
    if (areCommentThreadArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((thread, index) => {
      const previousThread = previousSnapshot[index];
      if (previousThread && areStructuredValuesEqual(previousThread, thread)) {
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
  handlers: Pick<UseHistoryResult, 'capture' | 'transaction' | 'undo' | 'redo'>,
): UseHistoryResult {
  const nextTimeline = history.timeline();
  const nextCanUndo = history.canUndo();
  const nextCanRedo = history.canRedo();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === history) {
    const previousSnapshot = previous.snapshot;
    const isTimelineEqual = areTimelineArraysEqual(previousSnapshot.timeline, nextTimeline);

    if (
      isTimelineEqual &&
      previousSnapshot.canUndo === nextCanUndo &&
      previousSnapshot.canRedo === nextCanRedo
    ) {
      return previousSnapshot;
    }

    previous.snapshot = {
      timeline: isTimelineEqual
        ? previousSnapshot.timeline
        : nextTimeline.map((entry, index) => {
            const previousEntry = previousSnapshot.timeline[index];
            if (previousEntry && areStructuredValuesEqual(previousEntry, entry)) {
              return previousEntry;
            }

            return entry;
          }),
      canUndo: nextCanUndo,
      canRedo: nextCanRedo,
      capture: previousSnapshot.capture,
      transaction: previousSnapshot.transaction,
      undo: previousSnapshot.undo,
      redo: previousSnapshot.redo,
    };
    return previous.snapshot;
  }

  const snapshot: UseHistoryResult = {
    timeline: nextTimeline,
    canUndo: nextCanUndo,
    canRedo: nextCanRedo,
    capture: handlers.capture,
    transaction: handlers.transaction,
    undo: handlers.undo,
    redo: handlers.redo,
  };

  cacheRef.current = {
    room,
    engine: history,
    snapshot,
  };
  return snapshot;
}

function readRecordingSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  recording: RecordingEngine,
  cacheRef: { current: RecordingSnapshotCache<TPresence> | null },
  handlers: Pick<UseRecordingResult, 'start' | 'stop' | 'replay' | 'exportRecording'>,
): UseRecordingResult {
  const state = recording.getState();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === recording) {
    const previousSnapshot = previous.snapshot;
    if (
      previousSnapshot.isRecording === state.isRecording &&
      previousSnapshot.frameCount === state.frameCount &&
      previousSnapshot.durationMs === state.durationMs
    ) {
      return previousSnapshot;
    }

    previous.snapshot = {
      isRecording: state.isRecording,
      frameCount: state.frameCount,
      durationMs: state.durationMs,
      start: previousSnapshot.start,
      stop: previousSnapshot.stop,
      replay: previousSnapshot.replay,
      exportRecording: previousSnapshot.exportRecording,
    };
    return previous.snapshot;
  }

  const snapshot: UseRecordingResult = {
    isRecording: state.isRecording,
    frameCount: state.frameCount,
    durationMs: state.durationMs,
    start: handlers.start,
    stop: handlers.stop,
    replay: handlers.replay,
    exportRecording: handlers.exportRecording,
  };

  cacheRef.current = {
    room,
    engine: recording,
    snapshot,
  };
  return snapshot;
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

  if (previous && previous.room === room && previous.engine === locks && previous.key === key) {
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

function readPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  presence: PresenceEngine<TPresence>,
  cacheRef: { current: PresenceSnapshotCache<TPresence> | null },
): UsePresenceResult<TPresence> {
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

    const nextSnapshot: UsePresenceResult<TPresence> = {
      self: isSelfEqual ? previousSnapshot.self : self,
      others: isOthersEqual ? previousSnapshot.others : others,
      all: isAllEqual ? previousSnapshot.all : all,
      update: previousSnapshot.update,
      replace: previousSnapshot.replace,
    };

    previous.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  const snapshot: UsePresenceResult<TPresence> = {
    self,
    others,
    all,
    update: presence.update,
    replace: presence.replace,
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

  if (previous && previous.room === room && previous.engine === presence) {
    const previousSnapshot = previous.snapshot;
    if (arePeerArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((peer, index) => {
      const previousPeer = previousSnapshot[index];
      if (previousPeer && arePeersEqual(previousPeer, peer)) {
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

  if (previous && previous.room === room && previous.engine === cursors) {
    const previousSnapshot = previous.snapshot;
    if (areCursorArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    previous.snapshot = nextSnapshot.map((position, index) => {
      const previousPosition = previousSnapshot[index];
      if (previousPosition && areCursorPositionsEqual(previousPosition, position)) {
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

function readConnectionStatusSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  cacheRef: { current: ConnectionStatusSnapshotCache<TPresence> | null },
): RoomStatus {
  const nextSnapshot = room.status;
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.snapshot === nextSnapshot) {
    return previous.snapshot;
  }

  cacheRef.current = {
    room,
    snapshot: nextSnapshot,
  };
  return nextSnapshot;
}

function readSharedStateSnapshot<TPresence extends PresenceData, T>(
  room: Room<TPresence>,
  state: StateEngine<T>,
  cacheRef: { current: SharedStateSnapshotCache<TPresence, T> | null },
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
