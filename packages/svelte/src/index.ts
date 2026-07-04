import type {
  ActivityEngine,
  ActivityEntry,
  ActivityOptions,
  AgentApprovalEngine,
  AgentApprovalOptions,
  AgentProposal,
  AwarenessEngine,
  AwarenessSelection,
  AwarenessState,
  Comment,
  CommentAnchor,
  CommentsEngine,
  CommentsOptions,
  CommentThread,
  CursorData,
  CursorEngine,
  CursorPosition,
  CursorRenderOptions,
  EventEngine,
  FieldPresenceEngine,
  FieldPresenceState,
  HistoryEngine,
  HistoryOptions,
  LockAcquireOptions,
  LockEngine,
  LockState,
  Peer,
  PointerBeam,
  PointerEngine,
  PresenceData,
  PresenceEngine,
  RecordingEngine,
  RecordingState,
  ReplaySession,
  Room,
  RoomfulRecording,
  RoomOptions,
  RoomStatus,
  StateEngine,
  StateOptions,
  TimelineEntry,
  Unsubscribe,
  ViewportEngine,
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

interface ViewportSnapshotCache<TPresence extends PresenceData> {
  engine: ViewportEngine;
  room: Room<TPresence>;
  snapshot: ViewportState[];
}

interface PointerSnapshotCache<TPresence extends PresenceData> {
  engine: PointerEngine;
  room: Room<TPresence>;
  snapshot: PointerBeam[];
}

interface LocksSnapshotCache<TPresence extends PresenceData> {
  engine: LockEngine;
  room: Room<TPresence>;
  snapshot: LockState[];
}

interface CommentsSnapshotCache<TPresence extends PresenceData> {
  engine: CommentsEngine;
  room: Room<TPresence>;
  snapshot: CommentThread[];
}

interface ActivitySnapshotCache<TPresence extends PresenceData> {
  engine: ActivityEngine;
  room: Room<TPresence>;
  snapshot: ActivityEntry[];
}

interface AgentApprovalsSnapshotCache<TPresence extends PresenceData> {
  engine: AgentApprovalEngine;
  room: Room<TPresence>;
  snapshot: AgentProposal[];
}

interface FieldPresenceSnapshotCache<TPresence extends PresenceData> {
  engine: FieldPresenceEngine;
  room: Room<TPresence>;
  snapshot: FieldPresenceState[];
}

interface HistorySnapshotCache<TPresence extends PresenceData> {
  engine: HistoryEngine;
  room: Room<TPresence>;
  snapshot: TimelineEntry[];
}

interface LockStateSnapshotCache<TPresence extends PresenceData> {
  engine: LockEngine;
  key: string;
  room: Room<TPresence>;
  snapshot: LockState | null;
}

interface LockStateRecord<TPresence extends PresenceData> {
  cache: LockStateSnapshotCache<TPresence> | null;
  cleanup: (() => void) | null;
  key: string;
  store: ValueStore<LockState | null>;
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
 * Readable viewport store augmented with DOM and follow helpers.
 */
export interface ViewportStore extends Readable<ViewportState[]> {
  /**
   * Svelte action that mounts viewport tracking on a scrollable container.
   */
  mount: Action<HTMLElement, undefined>;

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
 * Readable pointer (laser pointer) store augmented with DOM and control helpers.
 */
export interface PointerStore extends Readable<PointerBeam[]> {
  /**
   * Svelte action that mounts pointer tracking on a container element.
   */
  mount: Action<HTMLElement, undefined>;

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
 * Readable store of all held locks augmented with acquire/release helpers.
 */
export interface LocksStore extends Readable<LockState[]> {
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
 * Readable store of a single lock key's resolved state, or `null` when free.
 */
export type LockStateStore = Readable<LockState | null>;

/**
 * Readable store of collaborative comment threads augmented with the thread
 * mutators.
 */
export interface CommentsStore extends Readable<CommentThread[]> {
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
 * Readable store of the shared room activity feed (newest first) augmented with
 * the `record` control. The store's value updates on any local or remote entry.
 */
export interface ActivityStore extends Readable<ActivityEntry[]> {
  /**
   * Records a new activity entry authored by the local peer and broadcasts it.
   */
  record: ActivityEngine['record'];
}

/**
 * Readable store of the room's agent-approval proposals (newest first) augmented
 * with a reactive `pending` sub-store and the `approve`/`reject`/`propose`
 * controls. The store's value updates on any local or remote proposal change.
 */
export interface AgentApprovalsStore extends Readable<AgentProposal[]> {
  /**
   * A readable store of the pending proposals awaiting a decision (newest
   * first).
   */
  pending: Readable<AgentProposal[]>;

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
 * Readable store of the active fields (which remote peers are on which field) augmented with the
 * `setActiveField` control and a `getFieldPeers` reader. The store's value updates when peers enter
 * or leave a field.
 */
export interface FieldPresenceStore extends Readable<FieldPresenceState[]> {
  /**
   * Declares the field the local peer is active on, or `null` to clear it.
   */
  setActiveField: FieldPresenceEngine['setActiveField'];

  /**
   * Returns the remote peers on a field from the current snapshot.
   */
  getFieldPeers(fieldId: string): Peer[];
}

/**
 * Readable store of the shared collaborative history timeline augmented with
 * reactive `canUndo`/`canRedo` stores and the undo/redo controls. The store's
 * own value is the timeline (oldest first), updating on any local or remote
 * timeline change.
 */
export interface HistoryStore extends Readable<TimelineEntry[]> {
  /**
   * A readable store reporting whether the local peer has a tracked transaction
   * to undo.
   */
  canUndo: Readable<boolean>;

  /**
   * A readable store reporting whether the local peer has an undone transaction
   * to redo.
   */
  canRedo: Readable<boolean>;

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
 * Store of the session recorder exposing reactive `isRecording`, `frameCount`,
 * and `durationMs` sub-stores plus the start/stop/replay/export controls.
 * Capture is local to this peer; replay re-emits the captured frames at their
 * original tempo without re-applying them to a room.
 */
export interface RecordingStore {
  /**
   * A readable store reporting whether the recorder is currently capturing wire
   * signals.
   */
  isRecording: Readable<boolean>;

  /**
   * A readable store reporting how many frames the current take has captured.
   */
  frameCount: Readable<number>;

  /**
   * A readable store reporting the span of the current take in milliseconds.
   */
  durationMs: Readable<number>;

  /**
   * Begins capturing wire signals, discarding any previous take.
   */
  start: RecordingEngine['start'];

  /**
   * Stops capturing; the captured frames remain available.
   */
  stop: RecordingEngine['stop'];

  /**
   * Builds a timed playback session for a recording, or the current take.
   */
  replay(recording?: RoomfulRecording): ReplaySession;

  /**
   * Serializes the current take into a portable recording (named to stay a
   * valid identifier, since `export` is a reserved word).
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
 * Re-exports the agent-approval types for adapter consumers.
 */
export type { AgentApprovalEngine, AgentApprovalOptions, AgentProposal };

/**
 * Re-exports the field-presence types for adapter consumers.
 */
export type { FieldPresenceEngine, FieldPresenceState };

/**
 * Re-exports the collaborative history types for adapter consumers.
 */
export type { HistoryEngine, HistoryOptions, TimelineEntry };

/**
 * Re-exports the session-recording types for adapter consumers.
 */
export type { RecordingEngine, RecordingState, ReplaySession, RoomfulRecording };

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
   * Configures the activity feed (entry cap).
   */
  activity?: ActivityOptions;

  /**
   * Configures the agent-approval workflow (who may decide proposals).
   */
  agentApprovals?: AgentApprovalOptions;

  /**
   * Configures the comments store's storage backend.
   */
  comments?: CommentsOptions;

  /**
   * Configures the history store (timeline cap and capture debounce).
   */
  history?: HistoryOptions;

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
   * Exposes the shared room activity feed store plus the `record` control.
   */
  activity: ActivityStore;

  /**
   * Exposes the agent-approval proposals store plus the `pending` sub-store and
   * the `approve`/`reject`/`propose` controls.
   */
  agentApprovals: AgentApprovalsStore;

  /**
   * Exposes the field-presence store plus `setActiveField` and `getFieldPeers`.
   */
  fieldPresence: FieldPresenceStore;

  /**
   * Exposes the awareness store.
   */
  awareness: AwarenessStore;

  /**
   * Exposes the collaborative comments store plus the thread mutators.
   */
  comments: CommentsStore;

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
   * Exposes the collaborative history store: the timeline plus reactive
   * `canUndo`/`canRedo` stores and the undo/redo controls.
   */
  history: HistoryStore;

  /**
   * Exposes the store of all held locks plus acquire/release controls.
   */
  locks: LocksStore;

  /**
   * Creates a readable store for a single lock key's resolved state.
   *
   * @param key - The lock key to observe.
   * @returns A readable store holding the lock state, or `null` when free.
   */
  lockState(key: string): LockStateStore;

  /**
   * Exposes the pointer (laser pointer) store.
   */
  pointer: PointerStore;

  /**
   * Exposes the presence store.
   */
  presence: PresenceStore<TPresence>;

  /**
   * Exposes the session-recording store: reactive `isRecording`, `frameCount`,
   * and `durationMs` plus the start/stop/replay/export controls.
   */
  recording: RecordingStore;

  /**
   * Exposes the shared-state namespace.
   */
  state: StateNamespace;

  /**
   * Exposes the room connection status store.
   */
  status: Readable<RoomStatus>;

  /**
   * Exposes the viewport store.
   */
  viewport: ViewportStore;
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
  const {
    activity: activityOptions,
    agentApprovals: agentApprovalsOptions,
    comments: commentsOptions,
    history: historyOptions,
    onConnect,
    onDisconnect,
    onError,
    ...roomOptions
  } = options;
  const room = createRoom(roomId, roomOptions);
  const presenceEngine = room.usePresence();
  const cursorEngine = room.useCursors<TCursor>();
  const awarenessEngine = room.useAwareness();
  const viewportEngine = room.useViewport();
  const pointerEngine = room.usePointer();
  const lockEngine = room.useLocks();
  const commentsEngine = room.useComments(commentsOptions);
  const activityEngine = room.useActivity(activityOptions);
  const agentApprovalsEngine = room.useAgentApprovals(agentApprovalsOptions);
  const fieldPresenceEngine = room.useFieldPresence();
  const historyEngine = room.useHistory(historyOptions);
  const recordingEngine = room.useRecording();
  const eventEngine = room.useEvents();

  let destroyed = false;
  let mounted = false;
  let runtimeStarted = false;
  let trackedCursorElement: HTMLElement | null = null;
  let trackedViewportElement: HTMLElement | null = null;
  let trackedPointerElement: HTMLElement | null = null;
  let localCursorValue: Partial<CursorPosition<TCursor>> = {};
  let presenceCache: PresenceSnapshotCache<TPresence> | null = null;
  let cursorCache: CursorSnapshotCache<TPresence, TCursor> | null = null;
  let awarenessCache: AwarenessSnapshotCache<TPresence> | null = null;
  let viewportCache: ViewportSnapshotCache<TPresence> | null = null;
  let pointerCache: PointerSnapshotCache<TPresence> | null = null;
  let locksCache: LocksSnapshotCache<TPresence> | null = null;
  let commentsCache: CommentsSnapshotCache<TPresence> | null = null;
  let activityCache: ActivitySnapshotCache<TPresence> | null = null;
  let agentApprovalsCache: AgentApprovalsSnapshotCache<TPresence> | null = null;
  let fieldPresenceCache: FieldPresenceSnapshotCache<TPresence> | null = null;
  let historyCache: HistorySnapshotCache<TPresence> | null = null;
  let sharedStateController: SharedStateController<TPresence, unknown> | null = null;

  const cleanupRegistry = new Set<() => void>();
  const eventListeners = new Set<EventListenerRecord<TPresence>>();
  const eventChannels = new Map<string, EventChannelRecord<TPresence>>();
  const lockStateRecords = new Map<string, LockStateRecord<TPresence>>();

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
  const viewportStore = createValueStore(
    readViewportSnapshot(room, viewportEngine, {
      current: viewportCache,
      set(nextCache) {
        viewportCache = nextCache;
      },
    }),
  );
  const pointerStore = createValueStore(
    readPointerSnapshot(room, pointerEngine, {
      current: pointerCache,
      set(nextCache) {
        pointerCache = nextCache;
      },
    }),
  );
  const locksStore = createValueStore(
    readLocksSnapshot(room, lockEngine, {
      current: locksCache,
      set(nextCache) {
        locksCache = nextCache;
      },
    }),
  );
  const commentsStore = createValueStore(
    readCommentsSnapshot(room, commentsEngine, {
      current: commentsCache,
      set(nextCache) {
        commentsCache = nextCache;
      },
    }),
  );
  const activityStore = createValueStore(
    readActivitySnapshot(room, activityEngine, {
      current: activityCache,
      set(nextCache) {
        activityCache = nextCache;
      },
    }),
  );
  const initialAgentProposals = readAgentApprovalsSnapshot(room, agentApprovalsEngine, {
    current: agentApprovalsCache,
    set(nextCache) {
      agentApprovalsCache = nextCache;
    },
  });
  const agentApprovalsStore = createValueStore(initialAgentProposals);
  const agentApprovalsPendingStore = createValueStore(
    filterPendingProposals(initialAgentProposals),
  );
  const fieldPresenceStore = createValueStore(
    readFieldPresenceSnapshot(room, fieldPresenceEngine, {
      current: fieldPresenceCache,
      set(nextCache) {
        fieldPresenceCache = nextCache;
      },
    }),
  );
  const historyStore = createValueStore(
    readHistorySnapshot(room, historyEngine, {
      current: historyCache,
      set(nextCache) {
        historyCache = nextCache;
      },
    }),
  );
  const historyCanUndoStore = createValueStore<boolean>(historyEngine.canUndo());
  const historyCanRedoStore = createValueStore<boolean>(historyEngine.canRedo());
  const initialRecordingState = recordingEngine.getState();
  const recordingIsRecordingStore = createValueStore<boolean>(initialRecordingState.isRecording);
  const recordingFrameCountStore = createValueStore<number>(initialRecordingState.frameCount);
  const recordingDurationMsStore = createValueStore<number>(initialRecordingState.durationMs);
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

  const refreshViewport = (): void => {
    viewportStore.publish(
      readViewportSnapshot(room, viewportEngine, {
        current: viewportCache,
        set(nextCache) {
          viewportCache = nextCache;
        },
      }),
    );
  };

  const refreshPointer = (): void => {
    pointerStore.publish(
      readPointerSnapshot(room, pointerEngine, {
        current: pointerCache,
        set(nextCache) {
          pointerCache = nextCache;
        },
      }),
    );
  };

  const refreshLocks = (): void => {
    locksStore.publish(
      readLocksSnapshot(room, lockEngine, {
        current: locksCache,
        set(nextCache) {
          locksCache = nextCache;
        },
      }),
    );
  };

  const refreshComments = (): void => {
    commentsStore.publish(
      readCommentsSnapshot(room, commentsEngine, {
        current: commentsCache,
        set(nextCache) {
          commentsCache = nextCache;
        },
      }),
    );
  };

  const refreshActivity = (): void => {
    activityStore.publish(
      readActivitySnapshot(room, activityEngine, {
        current: activityCache,
        set(nextCache) {
          activityCache = nextCache;
        },
      }),
    );
  };

  const refreshAgentApprovals = (): void => {
    const proposals = readAgentApprovalsSnapshot(room, agentApprovalsEngine, {
      current: agentApprovalsCache,
      set(nextCache) {
        agentApprovalsCache = nextCache;
      },
    });
    agentApprovalsStore.publish(proposals);
    agentApprovalsPendingStore.publish(filterPendingProposals(proposals));
  };

  const refreshFieldPresence = (): void => {
    fieldPresenceStore.publish(
      readFieldPresenceSnapshot(room, fieldPresenceEngine, {
        current: fieldPresenceCache,
        set(nextCache) {
          fieldPresenceCache = nextCache;
        },
      }),
    );
  };

  const refreshHistory = (): void => {
    historyStore.publish(
      readHistorySnapshot(room, historyEngine, {
        current: historyCache,
        set(nextCache) {
          historyCache = nextCache;
        },
      }),
    );
    historyCanUndoStore.publish(historyEngine.canUndo());
    historyCanRedoStore.publish(historyEngine.canRedo());
  };

  const refreshRecording = (): void => {
    const recordingState = recordingEngine.getState();
    recordingIsRecordingStore.publish(recordingState.isRecording);
    recordingFrameCountStore.publish(recordingState.frameCount);
    recordingDurationMsStore.publish(recordingState.durationMs);
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

  const attachViewportSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = viewportEngine.subscribe(() => {
      refreshViewport();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachPointerSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = pointerEngine.subscribe(() => {
      refreshPointer();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachLocksSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = lockEngine.subscribeAll(() => {
      refreshLocks();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachCommentsSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = commentsEngine.subscribe(() => {
      refreshComments();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachActivitySubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = activityEngine.subscribe(() => {
      refreshActivity();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachAgentApprovalsSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = agentApprovalsEngine.subscribe(() => {
      refreshAgentApprovals();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachFieldPresenceSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = fieldPresenceEngine.subscribe(() => {
      refreshFieldPresence();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachHistorySubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = historyEngine.subscribe(() => {
      refreshHistory();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachRecordingSubscription = (): void => {
    if (!runtimeStarted) {
      return;
    }

    const unsubscribe = recordingEngine.subscribe(() => {
      refreshRecording();
    });

    registerCleanup(() => {
      unsubscribe();
    });
  };

  const attachLockStateRecord = (record: LockStateRecord<TPresence>): void => {
    if (!runtimeStarted || record.cleanup) {
      return;
    }

    const unsubscribe = lockEngine.subscribe(record.key, (lockState) => {
      record.store.publish(
        reconcileLockStateSnapshot(room, lockEngine, record.key, lockState, {
          current: record.cache,
          set(nextCache) {
            record.cache = nextCache;
          },
        }),
      );
    });

    record.cleanup = registerCleanup(() => {
      unsubscribe();
      if (record.cleanup) {
        record.cleanup = null;
      }
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
    attachViewportSubscription();
    attachPointerSubscription();
    attachLocksSubscription();
    attachCommentsSubscription();
    attachActivitySubscription();
    attachAgentApprovalsSubscription();
    attachFieldPresenceSubscription();
    attachHistorySubscription();
    attachRecordingSubscription();
    attachSharedStateSubscription();

    for (const record of eventListeners) {
      attachEventListener(record);
    }

    for (const record of eventChannels.values()) {
      attachEventChannel(record);
    }

    for (const record of lockStateRecords.values()) {
      attachLockStateRecord(record);
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

  const unmountTrackedViewport = (): void => {
    if (!trackedViewportElement) {
      return;
    }

    viewportEngine.unmount();
    trackedViewportElement = null;
  };

  const mountViewport = (element: HTMLElement): void => {
    assertAvailable('viewport.mount');

    if (trackedViewportElement === element) {
      return;
    }

    if (trackedViewportElement) {
      viewportEngine.unmount();
    }

    trackedViewportElement = element;
    viewportEngine.mount(element);
  };

  const unmountTrackedPointer = (): void => {
    if (!trackedPointerElement) {
      return;
    }

    pointerEngine.unmount();
    trackedPointerElement = null;
  };

  const mountPointer = (element: HTMLElement): void => {
    assertAvailable('pointer.mount');

    if (trackedPointerElement === element) {
      return;
    }

    if (trackedPointerElement) {
      pointerEngine.unmount();
    }

    trackedPointerElement = element;
    pointerEngine.mount(element);
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

  const viewport: ViewportStore = {
    subscribe(run, invalidate) {
      return viewportStore.subscribe(run, invalidate);
    },
    mount(node) {
      mountViewport(node);

      return {
        destroy() {
          if (trackedViewportElement === node) {
            unmountTrackedViewport();
          }
        },
      };
    },
    unmount() {
      unmountTrackedViewport();
    },
    broadcast() {
      assertAvailable('viewport.broadcast');
      viewportEngine.broadcast();
    },
    stopBroadcast() {
      assertAvailable('viewport.stopBroadcast');
      viewportEngine.stopBroadcast();
    },
    present() {
      assertAvailable('viewport.present');
      viewportEngine.present();
    },
    stopPresenting() {
      assertAvailable('viewport.stopPresenting');
      viewportEngine.stopPresenting();
    },
    follow(peerId) {
      assertAvailable('viewport.follow');
      viewportEngine.follow(peerId);
    },
    unfollow() {
      assertAvailable('viewport.unfollow');
      viewportEngine.unfollow();
    },
  };

  const pointer: PointerStore = {
    subscribe(run, invalidate) {
      return pointerStore.subscribe(run, invalidate);
    },
    mount(node) {
      mountPointer(node);

      return {
        destroy() {
          if (trackedPointerElement === node) {
            unmountTrackedPointer();
          }
        },
      };
    },
    unmount() {
      unmountTrackedPointer();
    },
    activate() {
      assertAvailable('pointer.activate');
      pointerEngine.activate();
    },
    deactivate() {
      assertAvailable('pointer.deactivate');
      pointerEngine.deactivate();
    },
    render(renderOptions) {
      assertAvailable('pointer.render');
      return pointerEngine.render(renderOptions);
    },
  };

  const locks: LocksStore = {
    subscribe(run, invalidate) {
      return locksStore.subscribe(run, invalidate);
    },
    acquire(key, lockOptions) {
      assertAvailable('locks.acquire');
      return lockEngine.acquire(key, lockOptions);
    },
    release(key) {
      assertAvailable('locks.release');
      lockEngine.release(key);
    },
    releaseAll() {
      assertAvailable('locks.releaseAll');
      lockEngine.releaseAll();
    },
    isLocked(key) {
      return lockEngine.isLocked(key);
    },
    getHolder(key) {
      return lockEngine.getHolder(key);
    },
  };

  const comments: CommentsStore = {
    subscribe(run, invalidate) {
      return commentsStore.subscribe(run, invalidate);
    },
    add(input) {
      assertAvailable('comments.add');
      return commentsEngine.add(input);
    },
    reply(threadId, text) {
      assertAvailable('comments.reply');
      return commentsEngine.thread(threadId).reply(text);
    },
    resolve(threadId) {
      assertAvailable('comments.resolve');
      return commentsEngine.thread(threadId).resolve();
    },
    reopen(threadId) {
      assertAvailable('comments.reopen');
      return commentsEngine.thread(threadId).reopen();
    },
    getByElement(elementId) {
      return commentsEngine.getByElement(elementId);
    },
    getOpen() {
      return commentsEngine.getOpen();
    },
  };

  const activity: ActivityStore = {
    subscribe(run, invalidate) {
      return activityStore.subscribe(run, invalidate);
    },
    record(type, data) {
      assertAvailable('activity.record');
      return activityEngine.record(type, data);
    },
  };

  const agentApprovals: AgentApprovalsStore = {
    subscribe(run, invalidate) {
      return agentApprovalsStore.subscribe(run, invalidate);
    },
    pending: {
      subscribe(run, invalidate) {
        return agentApprovalsPendingStore.subscribe(run, invalidate);
      },
    },
    approve(id) {
      assertAvailable('agentApprovals.approve');
      return agentApprovalsEngine.approve(id);
    },
    reject(id) {
      assertAvailable('agentApprovals.reject');
      return agentApprovalsEngine.reject(id);
    },
    propose(input) {
      assertAvailable('agentApprovals.propose');
      return agentApprovalsEngine.propose(input);
    },
  };

  const fieldPresence: FieldPresenceStore = {
    subscribe(run, invalidate) {
      return fieldPresenceStore.subscribe(run, invalidate);
    },
    setActiveField(fieldId) {
      assertAvailable('fieldPresence.setActiveField');
      fieldPresenceEngine.setActiveField(fieldId);
    },
    getFieldPeers(fieldId) {
      return fieldPresenceEngine.getFieldPeers(fieldId);
    },
  };

  const history: HistoryStore = {
    subscribe(run, invalidate) {
      return historyStore.subscribe(run, invalidate);
    },
    canUndo: {
      subscribe(run, invalidate) {
        return historyCanUndoStore.subscribe(run, invalidate);
      },
    },
    canRedo: {
      subscribe(run, invalidate) {
        return historyCanRedoStore.subscribe(run, invalidate);
      },
    },
    capture(action, payload) {
      assertAvailable('history.capture');
      historyEngine.capture(action, payload);
    },
    transaction(name, fn) {
      assertAvailable('history.transaction');
      historyEngine.transaction(name, fn);
    },
    undo() {
      assertAvailable('history.undo');
      return historyEngine.undo();
    },
    redo() {
      assertAvailable('history.redo');
      return historyEngine.redo();
    },
  };

  const recording: RecordingStore = {
    isRecording: {
      subscribe(run, invalidate) {
        return recordingIsRecordingStore.subscribe(run, invalidate);
      },
    },
    frameCount: {
      subscribe(run, invalidate) {
        return recordingFrameCountStore.subscribe(run, invalidate);
      },
    },
    durationMs: {
      subscribe(run, invalidate) {
        return recordingDurationMsStore.subscribe(run, invalidate);
      },
    },
    start() {
      assertAvailable('recording.start');
      recordingEngine.start();
    },
    stop() {
      assertAvailable('recording.stop');
      recordingEngine.stop();
    },
    replay(recordingInput) {
      assertAvailable('recording.replay');
      return recordingEngine.replay(recordingInput);
    },
    exportRecording() {
      assertAvailable('recording.exportRecording');
      return recordingEngine.export();
    },
  };

  const lockState = (key: string): LockStateStore => {
    assertAvailable('lockState');

    const existingRecord = lockStateRecords.get(key);
    if (existingRecord) {
      return {
        subscribe(run, invalidate) {
          return existingRecord.store.subscribe(run, invalidate);
        },
      };
    }

    const record: LockStateRecord<TPresence> = {
      cache: null,
      cleanup: null,
      key,
      store: createValueStore<LockState | null>(
        readLockStateSnapshot(room, lockEngine, key, {
          current: null,
          set() {
            return undefined;
          },
        }),
      ),
    };

    lockStateRecords.set(key, record);
    if (runtimeStarted) {
      attachLockStateRecord(record);
    }

    return {
      subscribe(run, invalidate) {
        return record.store.subscribe(run, invalidate);
      },
    };
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
    unmountTrackedViewport();
    unmountTrackedPointer();
    eventListeners.clear();
    for (const record of eventChannels.values()) {
      record.store.clear();
    }
    eventChannels.clear();
    for (const record of lockStateRecords.values()) {
      record.store.clear();
    }
    lockStateRecords.clear();
    presenceStore.clear();
    cursorStore.clear();
    awarenessStore.clear();
    viewportStore.clear();
    pointerStore.clear();
    locksStore.clear();
    commentsStore.clear();
    activityStore.clear();
    agentApprovalsStore.clear();
    agentApprovalsPendingStore.clear();
    fieldPresenceStore.clear();
    historyStore.clear();
    historyCanUndoStore.clear();
    historyCanRedoStore.clear();
    recordingIsRecordingStore.clear();
    recordingFrameCountStore.clear();
    recordingDurationMsStore.clear();
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
    activity,
    agentApprovals,
    awareness,
    comments,
    connect,
    cursors,
    destroy,
    disconnect,
    events,
    fieldPresence,
    history,
    locks,
    lockState,
    pointer,
    presence,
    recording,
    state,
    status,
    viewport,
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
  cacheRef: {
    current: ViewportSnapshotCache<TPresence> | null;
    set(nextCache: ViewportSnapshotCache<TPresence>): void;
  },
): ViewportState[] {
  const nextSnapshot = viewport.getAll();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === viewport) {
    const previousSnapshot = previous.snapshot;
    if (areViewportArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((state, index) => {
      const previousState = previousSnapshot[index];
      if (previousState && areStructuredValuesEqual(previousState, state)) {
        return previousState;
      }

      return state;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: viewport,
    room,
    snapshot: nextSnapshot,
  });
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
  cacheRef: {
    current: PointerSnapshotCache<TPresence> | null;
    set(nextCache: PointerSnapshotCache<TPresence>): void;
  },
): PointerBeam[] {
  const nextSnapshot = pointer.getAll();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === pointer) {
    const previousSnapshot = previous.snapshot;
    if (arePointerArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((beam, index) => {
      const previousBeam = previousSnapshot[index];
      if (previousBeam && areStructuredValuesEqual(previousBeam, beam)) {
        return previousBeam;
      }

      return beam;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: pointer,
    room,
    snapshot: nextSnapshot,
  });
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
  cacheRef: {
    current: LocksSnapshotCache<TPresence> | null;
    set(nextCache: LocksSnapshotCache<TPresence>): void;
  },
): LockState[] {
  const nextSnapshot = locks.getAll();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === locks) {
    const previousSnapshot = previous.snapshot;
    if (areLockArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((state, index) => {
      const previousState = previousSnapshot[index];
      if (previousState && areStructuredValuesEqual(previousState, state)) {
        return previousState;
      }

      return state;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: locks,
    room,
    snapshot: nextSnapshot,
  });
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
  cacheRef: {
    current: CommentsSnapshotCache<TPresence> | null;
    set(nextCache: CommentsSnapshotCache<TPresence>): void;
  },
): CommentThread[] {
  const nextSnapshot = comments.getAll();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === comments) {
    const previousSnapshot = previous.snapshot;
    if (areCommentThreadArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((thread, index) => {
      const previousThread = previousSnapshot[index];
      if (previousThread && areStructuredValuesEqual(previousThread, thread)) {
        return previousThread;
      }

      return thread;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: comments,
    room,
    snapshot: nextSnapshot,
  });
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
  cacheRef: {
    current: ActivitySnapshotCache<TPresence> | null;
    set(nextCache: ActivitySnapshotCache<TPresence>): void;
  },
): ActivityEntry[] {
  const nextSnapshot = activity.getEntries();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === activity) {
    const previousSnapshot = previous.snapshot;
    if (areActivityEntryArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((entry, index) => {
      const previousEntry = previousSnapshot[index];
      if (previousEntry && areStructuredValuesEqual(previousEntry, entry)) {
        return previousEntry;
      }

      return entry;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: activity,
    room,
    snapshot: nextSnapshot,
  });
  return nextSnapshot;
}

function filterPendingProposals(proposals: readonly AgentProposal[]): AgentProposal[] {
  return proposals.filter((proposal) => proposal.status === 'pending');
}

function areAgentProposalArraysEqual(
  previous: readonly AgentProposal[],
  next: readonly AgentProposal[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousProposal = previous[index];
    const nextProposal = next[index];

    if (
      !previousProposal ||
      !nextProposal ||
      !areStructuredValuesEqual(previousProposal, nextProposal)
    ) {
      return false;
    }
  }

  return true;
}

function readAgentApprovalsSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  approvals: AgentApprovalEngine,
  cacheRef: {
    current: AgentApprovalsSnapshotCache<TPresence> | null;
    set(nextCache: AgentApprovalsSnapshotCache<TPresence>): void;
  },
): AgentProposal[] {
  const nextSnapshot = approvals.getProposals();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === approvals) {
    const previousSnapshot = previous.snapshot;
    if (areAgentProposalArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((proposal, index) => {
      const previousProposal = previousSnapshot[index];
      if (previousProposal && areStructuredValuesEqual(previousProposal, proposal)) {
        return previousProposal;
      }

      return proposal;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: approvals,
    room,
    snapshot: nextSnapshot,
  });
  return nextSnapshot;
}

function areFieldPresenceArraysEqual(
  previous: readonly FieldPresenceState[],
  next: readonly FieldPresenceState[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousField = previous[index];
    const nextField = next[index];

    if (!previousField || !nextField || !areStructuredValuesEqual(previousField, nextField)) {
      return false;
    }
  }

  return true;
}

function readFieldPresenceSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  fieldPresence: FieldPresenceEngine,
  cacheRef: {
    current: FieldPresenceSnapshotCache<TPresence> | null;
    set(nextCache: FieldPresenceSnapshotCache<TPresence>): void;
  },
): FieldPresenceState[] {
  const nextSnapshot = fieldPresence.getActiveFields();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === fieldPresence) {
    const previousSnapshot = previous.snapshot;
    if (areFieldPresenceArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((field, index) => {
      const previousField = previousSnapshot[index];
      if (previousField && areStructuredValuesEqual(previousField, field)) {
        return previousField;
      }

      return field;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: fieldPresence,
    room,
    snapshot: nextSnapshot,
  });
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
  cacheRef: {
    current: HistorySnapshotCache<TPresence> | null;
    set(nextCache: HistorySnapshotCache<TPresence>): void;
  },
): TimelineEntry[] {
  const nextSnapshot = history.timeline();
  const previous = cacheRef.current;

  if (previous && previous.room === room && previous.engine === history) {
    const previousSnapshot = previous.snapshot;
    if (areTimelineArraysEqual(previousSnapshot, nextSnapshot)) {
      return previousSnapshot;
    }

    const stableSnapshot = nextSnapshot.map((entry, index) => {
      const previousEntry = previousSnapshot[index];
      if (previousEntry && areStructuredValuesEqual(previousEntry, entry)) {
        return previousEntry;
      }

      return entry;
    });
    previous.snapshot = stableSnapshot;
    return stableSnapshot;
  }

  cacheRef.set({
    engine: history,
    room,
    snapshot: nextSnapshot,
  });
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
  cacheRef: {
    current: LockStateSnapshotCache<TPresence> | null;
    set(nextCache: LockStateSnapshotCache<TPresence>): void;
  },
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

  cacheRef.set({
    engine: locks,
    key,
    room,
    snapshot: nextState,
  });
  return nextState;
}

function readLockStateSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  key: string,
  cacheRef: {
    current: LockStateSnapshotCache<TPresence> | null;
    set(nextCache: LockStateSnapshotCache<TPresence>): void;
  },
): LockState | null {
  return commitLockStateSnapshot(room, locks, key, resolveSingleLockState(locks, key), cacheRef);
}

function reconcileLockStateSnapshot<TPresence extends PresenceData>(
  room: Room<TPresence>,
  locks: LockEngine,
  key: string,
  state: LockState,
  cacheRef: {
    current: LockStateSnapshotCache<TPresence> | null;
    set(nextCache: LockStateSnapshotCache<TPresence>): void;
  },
): LockState | null {
  const nextState = state.holder === null ? null : state;
  return commitLockStateSnapshot(room, locks, key, nextState, cacheRef);
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
