import { TestBed } from '@angular/core/testing';
import type {
  ActivityEngine,
  ActivityEntry,
  AgentApprovalEngine,
  AwarenessEngine,
  AwarenessState,
  CommentAnchor,
  CommentsEngine,
  CommentThread,
  CursorData,
  CursorEngine,
  CursorPosition,
  EventEngine,
  FieldPresenceEngine,
  FieldPresenceState,
  HistoryEngine,
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
  RoomEventMap,
  RoomEventName,
  RoomfulRecording,
  RoomOptions,
  RoomStatus,
  StateChangeMeta,
  StateEngine,
  TimelineEntry,
  ViewportEngine,
  ViewportState,
} from '@roomful/core';
import { RoomfulError } from '@roomful/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createRoomMock } = vi.hoisted(() => {
  return {
    createRoomMock: vi.fn(),
  };
});

vi.mock('@roomful/core', async () => {
  const actual = await vi.importActual<typeof import('@roomful/core')>('@roomful/core');

  return {
    ...actual,
    createRoom: createRoomMock,
  };
});

import {
  injectActivity,
  injectAwareness,
  injectComments,
  injectConnectionStatus,
  injectCursors,
  injectEvent,
  injectFieldPresence,
  injectHistory,
  injectLocks,
  injectLockState,
  injectPeers,
  injectPointer,
  injectPresence,
  injectRecording,
  injectRoom,
  injectSharedState,
  injectViewport,
  provideRoomful,
  ROOMFUL_ROOM,
} from './index';

type RoomEventPayload = RoomEventMap<PresenceData>[RoomEventName];
type RoomEventHandler = (payload: RoomEventPayload) => void;
type AwarenessSubscriber = (peers: AwarenessState[]) => void;
type CursorSubscriber = (positions: CursorPosition<CursorData>[]) => void;
type EventSubscriber = (payload: unknown, from: Peer<PresenceData>) => void;
type PresenceSubscriber = (peers: Peer<PresenceData>[]) => void;
type StateSubscriber<T> = (value: T, meta: StateChangeMeta) => void;
type ViewportSubscriber = (states: ViewportState[]) => void;
type PointerSubscriber = (beams: PointerBeam[]) => void;
type LockStateSubscriber = (state: LockState) => void;
type LocksSubscriber = (states: LockState[]) => void;
type CommentsSubscriber = (threads: CommentThread[]) => void;
type ActivitySubscriber = (entries: ActivityEntry[]) => void;
type HistorySubscriber = (timeline: TimelineEntry[]) => void;
type RecordingSubscriber = (state: RecordingState) => void;

type TestPresenceEngine = PresenceEngine<PresenceData> & {
  emit(peers: Peer<PresenceData>[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: PresenceSubscriber) => () => void>>;
  update: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
  replace: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
};

type TestCursorEngine = CursorEngine<CursorData> & {
  emit(positions: CursorPosition<CursorData>[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: CursorSubscriber) => () => void>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
  getPositions: ReturnType<typeof vi.fn<() => CursorPosition<CursorData>[]>>;
  setPosition: ReturnType<typeof vi.fn<(position: Partial<CursorPosition<CursorData>>) => void>>;
};

type TestViewportEngine = ViewportEngine & {
  emit(states: ViewportState[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: ViewportSubscriber) => () => void>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
  broadcast: ReturnType<typeof vi.fn<() => void>>;
  stopBroadcast: ReturnType<typeof vi.fn<() => void>>;
  present: ReturnType<typeof vi.fn<() => void>>;
  stopPresenting: ReturnType<typeof vi.fn<() => void>>;
  follow: ReturnType<typeof vi.fn<(peerId: string) => void>>;
  unfollow: ReturnType<typeof vi.fn<() => void>>;
};

type TestPointerEngine = PointerEngine & {
  emit(beams: PointerBeam[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: PointerSubscriber) => () => void>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
  activate: ReturnType<typeof vi.fn<() => void>>;
  deactivate: ReturnType<typeof vi.fn<() => void>>;
  render: ReturnType<typeof vi.fn<() => () => void>>;
};

type TestLockEngine = LockEngine & {
  emitKey(key: string, state: LockState): void;
  emitAll(states: LockState[]): void;
  setHolder(key: string, holder: Peer<PresenceData> | null): void;
  keySubscriberCount(key: string): number;
  allSubscriberCount(): number;
  acquire: ReturnType<typeof vi.fn<(key: string) => Promise<boolean>>>;
  release: ReturnType<typeof vi.fn<(key: string) => void>>;
  releaseAll: ReturnType<typeof vi.fn<() => void>>;
};

type TestAwarenessEngine = AwarenessEngine & {
  emit(peers: AwarenessState[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: AwarenessSubscriber) => () => void>>;
  set: ReturnType<typeof vi.fn<(value: Record<string, unknown>) => void>>;
  setFocus: ReturnType<typeof vi.fn<(elementId: string | null) => void>>;
  setSelection: ReturnType<typeof vi.fn<(selection: AwarenessState['selection'] | null) => void>>;
  setTyping: ReturnType<typeof vi.fn<(isTyping: boolean) => void>>;
};

type TestCommentsEngine = CommentsEngine & {
  emit(threads: CommentThread[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: CommentsSubscriber) => () => void>>;
  add: ReturnType<
    typeof vi.fn<(input: { anchor: CommentAnchor; text: string }) => Promise<CommentThread>>
  >;
  reply: ReturnType<typeof vi.fn<(threadId: string, text: string) => Promise<CommentThread>>>;
  resolve: ReturnType<typeof vi.fn<(threadId: string) => Promise<CommentThread>>>;
  reopen: ReturnType<typeof vi.fn<(threadId: string) => Promise<CommentThread>>>;
};

type TestActivityEngine = ActivityEngine & {
  emit(entries: ActivityEntry[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: ActivitySubscriber) => () => void>>;
  record: ReturnType<typeof vi.fn<ActivityEngine['record']>>;
};

type FieldPresenceSubscriber = (fields: FieldPresenceState[]) => void;

type TestFieldPresenceEngine = FieldPresenceEngine & {
  emit(fields: FieldPresenceState[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: FieldPresenceSubscriber) => () => void>>;
  setActiveField: ReturnType<typeof vi.fn<FieldPresenceEngine['setActiveField']>>;
};

type TestHistoryEngine = HistoryEngine & {
  emit(timeline: TimelineEntry[]): void;
  setCanUndo(value: boolean): void;
  setCanRedo(value: boolean): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: HistorySubscriber) => () => void>>;
  capture: ReturnType<typeof vi.fn<(action: string, payload?: unknown) => void>>;
  transaction: ReturnType<typeof vi.fn<(name: string, fn: () => void) => void>>;
  undo: ReturnType<typeof vi.fn<() => Promise<void>>>;
  redo: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

type TestRecordingEngine = RecordingEngine & {
  emit(state: RecordingState): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: RecordingSubscriber) => () => void>>;
  start: ReturnType<typeof vi.fn<() => void>>;
  stop: ReturnType<typeof vi.fn<() => void>>;
  export: ReturnType<typeof vi.fn<() => RoomfulRecording>>;
  replay: ReturnType<typeof vi.fn<(recording?: RoomfulRecording) => ReplaySession>>;
};

type TestEventEngine = EventEngine<PresenceData> & {
  deliver(name: string, payload: unknown, from?: Peer<PresenceData>): void;
  subscriberCount(name: string): number;
  emit: ReturnType<typeof vi.fn<(name: string, payload: unknown) => void>>;
  emitTo: ReturnType<typeof vi.fn<(peerId: string, name: string, payload: unknown) => void>>;
  on: ReturnType<typeof vi.fn<(name: string, cb: EventSubscriber) => () => void>>;
  off: ReturnType<typeof vi.fn<(name: string, cb: EventSubscriber) => void>>;
};

type TestStateEngine<T> = StateEngine<T> & {
  emit(value: T, meta?: StateChangeMeta): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: StateSubscriber<T>) => () => void>>;
  get: ReturnType<typeof vi.fn<() => T>>;
  set: ReturnType<typeof vi.fn<(value: T) => void>>;
};

type TestRoom = Room<PresenceData> & {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  emit: <TEvent extends RoomEventName>(
    event: TEvent,
    payload: RoomEventMap<PresenceData>[TEvent],
  ) => void;
  listenerCount(event: RoomEventName): number;
  setPeers(peers: Peer<PresenceData>[]): void;
  setStatus(status: RoomStatus): void;
  awarenessEngine: TestAwarenessEngine;
  commentsEngine: TestCommentsEngine;
  cursorEngine: TestCursorEngine;
  eventEngine: TestEventEngine;
  historyEngine: TestHistoryEngine;
  lockEngine: TestLockEngine;
  pointerEngine: TestPointerEngine;
  presenceEngine: TestPresenceEngine;
  recordingEngine: TestRecordingEngine;
  stateEngine: TestStateEngine<unknown>;
  viewportEngine: TestViewportEngine;
};

function createPeer(id: string, overrides: Partial<Peer<PresenceData>> = {}): Peer<PresenceData> {
  return {
    id,
    joinedAt: 1,
    lastSeen: 1,
    name: id,
    ...overrides,
  };
}

function createCursor(
  userId: string,
  overrides: Partial<CursorPosition<CursorData>> = {},
): CursorPosition<CursorData> {
  return {
    userId,
    name: userId,
    color: '#111111',
    x: 0.25,
    y: 0.75,
    xAbsolute: 25,
    yAbsolute: 75,
    idle: false,
    ...overrides,
  };
}

function createAwareness(peerId: string, overrides: Partial<AwarenessState> = {}): AwarenessState {
  return {
    peerId,
    ...overrides,
  };
}

function createMockPresenceEngine(
  selfPeerId: string,
  peers: Peer<PresenceData>[],
): TestPresenceEngine {
  const subscribers = new Set<PresenceSubscriber>();
  let currentPeers = peers;

  const engine = {
    update: vi.fn(),
    replace: vi.fn(),
    subscribe: vi.fn((callback: PresenceSubscriber) => {
      subscribers.add(callback);
      callback(currentPeers);

      return () => {
        subscribers.delete(callback);
      };
    }),
    get(peerId: string) {
      return (
        currentPeers.find((peer) => {
          return peer.id === peerId;
        }) ?? null
      );
    },
    getAll() {
      return currentPeers;
    },
    getSelf() {
      return (
        currentPeers.find((peer) => {
          return peer.id === selfPeerId;
        }) ?? currentPeers[0]
      );
    },
    emit(nextPeers: Peer<PresenceData>[]) {
      currentPeers = nextPeers;
      for (const subscriber of subscribers) {
        subscriber(currentPeers);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestPresenceEngine;

  return engine;
}

function createMockAwarenessEngine(peers: AwarenessState[] = []): TestAwarenessEngine {
  const subscribers = new Set<AwarenessSubscriber>();
  let currentPeers = peers;

  const engine = {
    set: vi.fn(),
    setTyping: vi.fn(),
    setFocus: vi.fn(),
    setSelection: vi.fn(),
    subscribe: vi.fn((callback: AwarenessSubscriber) => {
      subscribers.add(callback);
      callback(currentPeers);

      return () => {
        subscribers.delete(callback);
      };
    }),
    getAll() {
      return currentPeers;
    },
    emit(nextPeers: AwarenessState[]) {
      currentPeers = nextPeers;
      for (const subscriber of subscribers) {
        subscriber(currentPeers);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestAwarenessEngine;

  return engine;
}

function createMockCursorEngine(positions: CursorPosition<CursorData>[] = []): TestCursorEngine {
  const subscribers = new Set<CursorSubscriber>();
  let currentPositions = positions;

  const engine = {
    mount: vi.fn(),
    unmount: vi.fn(),
    render: vi.fn(),
    setPosition: vi.fn(),
    getPositions: vi.fn(() => {
      return currentPositions;
    }),
    subscribe: vi.fn((callback: CursorSubscriber) => {
      subscribers.add(callback);
      callback(currentPositions);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextPositions: CursorPosition<CursorData>[]) {
      currentPositions = nextPositions;
      for (const subscriber of subscribers) {
        subscriber(currentPositions);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestCursorEngine;

  return engine;
}

function createViewport(peerId: string, overrides: Partial<ViewportState> = {}): ViewportState {
  return {
    peerId,
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    viewportWidth: 200,
    viewportHeight: 200,
    focusedElement: null,
    ...overrides,
  };
}

function createMockViewportEngine(states: ViewportState[] = []): TestViewportEngine {
  const subscribers = new Set<ViewportSubscriber>();
  let currentStates = states;

  const engine = {
    mount: vi.fn(),
    unmount: vi.fn(),
    broadcast: vi.fn(),
    stopBroadcast: vi.fn(),
    present: vi.fn(),
    stopPresenting: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
    getAll: vi.fn(() => {
      return currentStates;
    }),
    get(peerId: string) {
      return currentStates.find((state) => {
        return state.peerId === peerId;
      });
    },
    subscribe: vi.fn((callback: ViewportSubscriber) => {
      subscribers.add(callback);
      callback(currentStates);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextStates: ViewportState[]) {
      currentStates = nextStates;
      for (const subscriber of subscribers) {
        subscriber(currentStates);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestViewportEngine;

  return engine;
}

function createBeam(peerId: string, overrides: Partial<PointerBeam> = {}): PointerBeam {
  return {
    peerId,
    name: peerId,
    color: '#22c55e',
    x: 0.25,
    y: 0.75,
    active: true,
    ...overrides,
  };
}

function createMockPointerEngine(beams: PointerBeam[] = []): TestPointerEngine {
  const subscribers = new Set<PointerSubscriber>();
  let currentBeams = beams;

  const engine = {
    mount: vi.fn(),
    unmount: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    render: vi.fn(() => {
      return () => undefined;
    }),
    getAll: vi.fn(() => {
      return currentBeams;
    }),
    subscribe: vi.fn((callback: PointerSubscriber) => {
      subscribers.add(callback);
      callback(currentBeams);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextBeams: PointerBeam[]) {
      currentBeams = nextBeams;
      for (const subscriber of subscribers) {
        subscriber(currentBeams);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestPointerEngine;

  return engine;
}

function createLock(key: string, holder: Peer<PresenceData> | null = null): LockState {
  return {
    key,
    holder,
    acquiredAt: holder ? 1 : 0,
    expiresAt: null,
  };
}

function createMockLockEngine(): TestLockEngine {
  const keySubscribers = new Map<string, Set<LockStateSubscriber>>();
  const allSubscribers = new Set<LocksSubscriber>();
  const holders = new Map<string, LockState>();

  const collectAll = (): LockState[] => {
    return Array.from(holders.values()).filter((state) => {
      return state.holder !== null;
    });
  };

  const stateFor = (key: string): LockState => {
    return holders.get(key) ?? createLock(key, null);
  };

  const engine = {
    acquire: vi.fn(async () => {
      return true;
    }),
    release: vi.fn(),
    releaseAll: vi.fn(),
    isLocked(key: string) {
      return stateFor(key).holder !== null;
    },
    getHolder(key: string) {
      return stateFor(key).holder;
    },
    getAll() {
      return collectAll();
    },
    subscribe: vi.fn((key: string, callback: LockStateSubscriber) => {
      const subscribers = keySubscribers.get(key) ?? new Set<LockStateSubscriber>();
      subscribers.add(callback);
      keySubscribers.set(key, subscribers);
      callback(stateFor(key));

      return () => {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          keySubscribers.delete(key);
        }
      };
    }),
    subscribeAll: vi.fn((callback: LocksSubscriber) => {
      allSubscribers.add(callback);
      callback(collectAll());

      return () => {
        allSubscribers.delete(callback);
      };
    }),
    setHolder(key: string, holder: Peer<PresenceData> | null) {
      holders.set(key, createLock(key, holder));
    },
    emitKey(key: string, state: LockState) {
      holders.set(key, state);
      for (const subscriber of keySubscribers.get(key) ?? []) {
        subscriber(state);
      }
    },
    emitAll(states: LockState[]) {
      holders.clear();
      for (const state of states) {
        holders.set(state.key, state);
      }

      for (const subscriber of allSubscribers) {
        subscriber(states);
      }
    },
    keySubscriberCount(key: string) {
      return keySubscribers.get(key)?.size ?? 0;
    },
    allSubscriberCount() {
      return allSubscribers.size;
    },
  } as TestLockEngine;

  return engine;
}

function createCommentThread(id: string, overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id,
    anchor: { elementId: `element-${id}` },
    author: createPeer(`author-${id}`),
    text: `thread ${id}`,
    createdAt: 1,
    resolved: false,
    replies: [],
    ...overrides,
  };
}

function createMockCommentsEngine(threads: CommentThread[] = []): TestCommentsEngine {
  const subscribers = new Set<CommentsSubscriber>();
  let currentThreads = threads;

  const findThread = (threadId: string): CommentThread | undefined => {
    return currentThreads.find((thread) => {
      return thread.id === threadId;
    });
  };

  const writeThread = (next: CommentThread): void => {
    currentThreads = currentThreads.map((thread) => {
      return thread.id === next.id ? next : thread;
    });
    for (const subscriber of subscribers) {
      subscriber(currentThreads);
    }
  };

  const engine = {
    add: vi.fn(async (input: { anchor: CommentAnchor; text: string }) => {
      const thread = createCommentThread(`thread-${currentThreads.length + 1}`, {
        anchor: input.anchor,
        text: input.text,
      });
      currentThreads = [...currentThreads, thread];
      for (const subscriber of subscribers) {
        subscriber(currentThreads);
      }
      return thread;
    }),
    reply: vi.fn(async (threadId: string, text: string) => {
      const current = findThread(threadId) ?? createCommentThread(threadId);
      const next: CommentThread = {
        ...current,
        replies: [
          ...current.replies,
          {
            id: `reply-${current.replies.length + 1}`,
            author: createPeer(`reply-author-${threadId}`),
            text,
            createdAt: 2,
          },
        ],
      };
      writeThread(next);
      return next;
    }),
    resolve: vi.fn(async (threadId: string) => {
      const current = findThread(threadId) ?? createCommentThread(threadId);
      const next: CommentThread = { ...current, resolved: true };
      writeThread(next);
      return next;
    }),
    reopen: vi.fn(async (threadId: string) => {
      const current = findThread(threadId) ?? createCommentThread(threadId);
      const next: CommentThread = { ...current, resolved: false };
      writeThread(next);
      return next;
    }),
    thread(threadId: string) {
      return {
        reply: (text: string) => engine.reply(threadId, text),
        resolve: () => engine.resolve(threadId),
        reopen: () => engine.reopen(threadId),
      };
    },
    getAll() {
      return currentThreads;
    },
    getByElement(elementId: string) {
      return currentThreads.filter((thread) => {
        return 'elementId' in thread.anchor && thread.anchor.elementId === elementId;
      });
    },
    getOpen() {
      return currentThreads.filter((thread) => {
        return !thread.resolved;
      });
    },
    subscribe: vi.fn((callback: CommentsSubscriber) => {
      subscribers.add(callback);
      callback(currentThreads);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextThreads: CommentThread[]) {
      currentThreads = nextThreads;
      for (const subscriber of subscribers) {
        subscriber(currentThreads);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestCommentsEngine;

  return engine;
}

function createActivityEntry(id: string, overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id,
    type: 'seed',
    actor: createPeer(`actor-${id}`),
    timestamp: 1,
    ...overrides,
  };
}

function createFieldPresenceState(fieldId: string, peerIds: string[]): FieldPresenceState {
  return { fieldId, peers: peerIds.map((peerId) => createPeer(peerId)) };
}

function createMockFieldPresenceEngine(
  initial: FieldPresenceState[] = [],
): TestFieldPresenceEngine {
  const subscribers = new Set<FieldPresenceSubscriber>();
  let fields = initial;

  const engine = {
    setActiveField: vi.fn(),
    getFieldPeers(fieldId: string) {
      return fields.find((field) => field.fieldId === fieldId)?.peers ?? [];
    },
    getActiveFields() {
      return fields;
    },
    subscribe: vi.fn((callback: FieldPresenceSubscriber) => {
      subscribers.add(callback);
      callback(fields);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextFields: FieldPresenceState[]) {
      fields = nextFields;
      for (const subscriber of subscribers) {
        subscriber(fields);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestFieldPresenceEngine;

  return engine;
}

function createMockActivityEngine(entries: ActivityEntry[] = []): TestActivityEngine {
  const subscribers = new Set<ActivitySubscriber>();
  let currentEntries = entries;

  const engine = {
    record: vi.fn((type: string, data?: unknown) => {
      const entry = createActivityEntry(`entry-${currentEntries.length + 1}`, {
        type,
        data,
        timestamp: currentEntries.length + 2,
      });
      currentEntries = [entry, ...currentEntries];
      for (const subscriber of subscribers) {
        subscriber(currentEntries);
      }
      return entry;
    }),
    getEntries() {
      return currentEntries;
    },
    subscribe: vi.fn((callback: ActivitySubscriber) => {
      subscribers.add(callback);
      callback(currentEntries);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextEntries: ActivityEntry[]) {
      currentEntries = nextEntries;
      for (const subscriber of subscribers) {
        subscriber(currentEntries);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestActivityEngine;

  return engine;
}

function createTimelineEntry(id: string, overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id,
    peerId: `peer-${id}`,
    peerName: `Peer ${id}`,
    action: id,
    timestamp: 1,
    description: id,
    ...overrides,
  };
}

function createMockHistoryEngine(timeline: TimelineEntry[] = []): TestHistoryEngine {
  const subscribers = new Set<HistorySubscriber>();
  let currentTimeline = timeline;
  let currentCanUndo = false;
  let currentCanRedo = false;

  const notify = (): void => {
    for (const subscriber of subscribers) {
      subscriber(currentTimeline);
    }
  };

  const engine = {
    capture: vi.fn((action: string, payload?: unknown) => {
      currentTimeline = [
        ...currentTimeline,
        createTimelineEntry(`entry-${currentTimeline.length + 1}`, {
          action,
          description: typeof payload === 'string' && payload.length > 0 ? payload : action,
        }),
      ];
      notify();
    }),
    transaction: vi.fn((name: string, fn: () => void) => {
      fn();
      currentCanUndo = true;
      currentCanRedo = false;
      currentTimeline = [
        ...currentTimeline,
        createTimelineEntry(`entry-${currentTimeline.length + 1}`, {
          action: name,
          description: name,
        }),
      ];
      notify();
    }),
    undo: vi.fn(async () => {
      currentCanUndo = false;
      currentCanRedo = true;
      notify();
    }),
    redo: vi.fn(async () => {
      currentCanUndo = true;
      currentCanRedo = false;
      notify();
    }),
    canUndo() {
      return currentCanUndo;
    },
    canRedo() {
      return currentCanRedo;
    },
    timeline() {
      return currentTimeline;
    },
    subscribe: vi.fn((callback: HistorySubscriber) => {
      subscribers.add(callback);
      callback(currentTimeline);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextTimeline: TimelineEntry[]) {
      currentTimeline = nextTimeline;
      notify();
    },
    setCanUndo(value: boolean) {
      currentCanUndo = value;
      notify();
    },
    setCanRedo(value: boolean) {
      currentCanRedo = value;
      notify();
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestHistoryEngine;

  return engine;
}

function createRecordingState(overrides: Partial<RecordingState> = {}): RecordingState {
  return {
    isRecording: false,
    frameCount: 0,
    durationMs: 0,
    ...overrides,
  };
}

function createMockRecordingEngine(
  initialState: RecordingState = createRecordingState(),
): TestRecordingEngine {
  const subscribers = new Set<RecordingSubscriber>();
  let currentState = initialState;

  const engine = {
    start: vi.fn(),
    stop: vi.fn(),
    getFrames: vi.fn(() => {
      return [];
    }),
    export: vi.fn((): RoomfulRecording => {
      return {
        version: 1,
        roomId: 'room-rec',
        peerId: 'peer-rec',
        startedAt: 0,
        durationMs: currentState.durationMs,
        frames: [],
      };
    }),
    replay: vi.fn((): ReplaySession => {
      return {
        play: vi.fn(),
        stop: vi.fn(),
        subscribe: vi.fn(() => {
          return () => undefined;
        }),
      };
    }),
    getState() {
      return currentState;
    },
    subscribe: vi.fn((callback: RecordingSubscriber) => {
      subscribers.add(callback);
      callback(currentState);

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextState: RecordingState) {
      currentState = nextState;
      for (const subscriber of subscribers) {
        subscriber(currentState);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestRecordingEngine;

  return engine;
}

function createMockEventEngine(): TestEventEngine {
  const subscribers = new Map<string, Set<EventSubscriber>>();

  const engine = {
    emit: vi.fn(),
    emitTo: vi.fn(),
    on: vi.fn((name: string, callback: EventSubscriber) => {
      const handlers = subscribers.get(name) ?? new Set<EventSubscriber>();
      handlers.add(callback);
      subscribers.set(name, handlers);

      return () => {
        handlers.delete(callback);
        if (handlers.size === 0) {
          subscribers.delete(name);
        }
      };
    }),
    off: vi.fn((name: string, callback: EventSubscriber) => {
      const handlers = subscribers.get(name);
      if (!handlers) {
        return;
      }

      handlers.delete(callback);
      if (handlers.size === 0) {
        subscribers.delete(name);
      }
    }),
    deliver(name: string, payload: unknown, from = createPeer('event-source')) {
      for (const subscriber of subscribers.get(name) ?? []) {
        subscriber(payload, from);
      }
    },
    subscriberCount(name: string) {
      return subscribers.get(name)?.size ?? 0;
    },
  } as TestEventEngine;

  return engine;
}

function cloneTestValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value;
}

function createStateMeta(overrides: Partial<StateChangeMeta> = {}): StateChangeMeta {
  return {
    reason: 'set',
    changedBy: 'peer-state',
    timestamp: 1,
    pending: false,
    queuedMutationCount: 0,
    ...overrides,
  };
}

function createMockStateEngine<T>(initialValue: T): TestStateEngine<T> {
  const subscribers = new Set<StateSubscriber<T>>();
  let currentValue = cloneTestValue(initialValue);

  const engine = {
    get: vi.fn(() => {
      return cloneTestValue(currentValue);
    }),
    set: vi.fn((nextValue: T) => {
      currentValue = cloneTestValue(nextValue);
      const meta = createStateMeta({
        changedBy: 'local',
      });
      for (const subscriber of subscribers) {
        subscriber(engine.get(), meta);
      }
    }),
    patch: vi.fn(),
    undo: vi.fn(),
    reset: vi.fn(),
    subscribe: vi.fn((callback: StateSubscriber<T>) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextValue: T, meta: StateChangeMeta = createStateMeta()) {
      currentValue = cloneTestValue(nextValue);
      for (const subscriber of subscribers) {
        subscriber(engine.get(), meta);
      }
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestStateEngine<T>;

  return engine;
}

function createMockRoom(
  roomId = 'room-1',
  options: RoomOptions<PresenceData> = {},
  config: {
    activityEngine?: TestActivityEngine;
    fieldPresenceEngine?: TestFieldPresenceEngine;
    awarenessEngine?: TestAwarenessEngine;
    commentsEngine?: TestCommentsEngine;
    cursorEngine?: TestCursorEngine;
    eventEngine?: TestEventEngine;
    historyEngine?: TestHistoryEngine;
    lockEngine?: TestLockEngine;
    peerId?: string;
    pointerEngine?: TestPointerEngine;
    presenceEngine?: TestPresenceEngine;
    recordingEngine?: TestRecordingEngine;
    status?: RoomStatus;
    stateEngine?: TestStateEngine<unknown>;
    viewportEngine?: TestViewportEngine;
  } = {},
): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();
  const peerId = config.peerId ?? `${roomId}-peer`;
  const activityEngine = config.activityEngine ?? createMockActivityEngine();
  const fieldPresenceEngine = config.fieldPresenceEngine ?? createMockFieldPresenceEngine();
  const awarenessEngine = config.awarenessEngine ?? createMockAwarenessEngine();
  const commentsEngine = config.commentsEngine ?? createMockCommentsEngine();
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const eventEngine = config.eventEngine ?? createMockEventEngine();
  const historyEngine = config.historyEngine ?? createMockHistoryEngine();
  const lockEngine = config.lockEngine ?? createMockLockEngine();
  const recordingEngine = config.recordingEngine ?? createMockRecordingEngine();
  const stateEngine = config.stateEngine ?? createMockStateEngine({});
  const viewportEngine = config.viewportEngine ?? createMockViewportEngine();
  const pointerEngine = config.pointerEngine ?? createMockPointerEngine();
  const presenceEngine =
    config.presenceEngine ?? createMockPresenceEngine(peerId, [createPeer(peerId)]);
  let currentStatus = config.status ?? 'idle';
  let currentPeers = presenceEngine.getAll().filter((peer) => {
    return peer.id !== peerId;
  });

  const originalPresenceEmit = presenceEngine.emit.bind(presenceEngine);
  presenceEngine.emit = (nextPeers: Peer<PresenceData>[]) => {
    currentPeers = nextPeers.filter((peer) => {
      return peer.id !== peerId;
    });
    originalPresenceEmit(nextPeers);
  };

  const room = {
    id: roomId,
    peerId,
    get status() {
      return currentStatus;
    },
    get peers() {
      return currentPeers;
    },
    get peerCount() {
      return currentPeers.length;
    },
    connect: vi.fn(async () => {
      currentStatus = 'connecting';
      return undefined;
    }),
    disconnect: vi.fn(async () => {
      currentStatus = 'disconnected';
      return undefined;
    }),
    getDiagnostics: vi.fn(async () => {
      return {
        timestamp: 1,
        roomId,
        peerId,
        status: currentStatus,
        transport: {
          current: null,
          lastDisconnectReason: null,
          reconnectAttempt: 0,
        },
        debug: {
          transport: false,
          state: false,
          presence: false,
          events: false,
          performance: false,
          productionInfoSuppressed: false,
        },
        peers: {
          remoteCount: currentPeers.length,
          remotePeerIds: currentPeers.map((peer) => {
            return peer.id;
          }),
        },
        presence: {
          selfLastSeen: 1,
          heartbeatActive: false,
        },
        state: {
          configured: false,
          strategy: null,
          persistenceEnabled: false,
          queuedMutationCount: 0,
          offlineReplayInProgress: false,
          stateSizeBytes: null,
        },
        events: {
          registeredEventNames: [],
          messagesSent: 0,
          messagesReceived: 0,
          broadcastsSent: 0,
          directSends: 0,
          latestConnectDurationMs: null,
        },
        encryption: {
          enabled: false,
          incompatiblePeerIds: [],
          decryptionErrorPeerIds: [],
        },
      };
    }),
    usePresence: vi.fn(() => {
      return presenceEngine;
    }),
    useCursors: vi.fn(() => {
      return cursorEngine;
    }),
    useState: vi.fn(() => {
      return stateEngine;
    }),
    useAwareness: vi.fn(() => {
      return awarenessEngine;
    }),
    useViewport: vi.fn(() => {
      return viewportEngine;
    }),
    usePointer: vi.fn(() => {
      return pointerEngine;
    }),
    useLocks: vi.fn(() => {
      return lockEngine;
    }),
    useComments: vi.fn(() => {
      return commentsEngine;
    }),
    useActivity: vi.fn(() => {
      return activityEngine;
    }),
    useAgentApprovals: vi.fn((): AgentApprovalEngine => {
      return {
        propose: () => ({
          id: '',
          proposer: createPeer('self'),
          type: '',
          status: 'pending',
          timestamp: 0,
        }),
        approve: () => undefined,
        reject: () => undefined,
        getProposals: () => [],
        getPending: () => [],
        subscribe: () => () => undefined,
      };
    }),
    useFieldPresence: vi.fn(() => {
      return fieldPresenceEngine;
    }),
    useHistory: vi.fn(() => {
      return historyEngine;
    }),
    useRecording: vi.fn(() => {
      return recordingEngine;
    }),
    useEvents: vi.fn(() => {
      return eventEngine;
    }),
    getYDoc: vi.fn(),
    getYProvider: vi.fn(),
    on: vi.fn((event: RoomEventName, handler: RoomEventHandler) => {
      const eventHandlers = handlers.get(event) ?? new Set<RoomEventHandler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);

      return () => {
        eventHandlers.delete(handler);
      };
    }),
    off: vi.fn((event: RoomEventName, handler: RoomEventHandler) => {
      handlers.get(event)?.delete(handler);
    }),
    emit: (event: RoomEventName, payload: RoomEventPayload) => {
      switch (event) {
        case 'connected':
          currentStatus = 'connected';
          break;
        case 'reconnecting':
          currentStatus = 'reconnecting';
          break;
        case 'disconnected':
          currentStatus = 'disconnected';
          break;
        case 'error':
          currentStatus = 'error';
          break;
        default:
          break;
      }

      for (const handler of handlers.get(event) ?? []) {
        handler(payload);
      }
    },
    listenerCount(event: RoomEventName) {
      return handlers.get(event)?.size ?? 0;
    },
    setPeers(peers: Peer<PresenceData>[]) {
      currentPeers = peers;
    },
    setStatus(status: RoomStatus) {
      currentStatus = status;
    },
    awarenessEngine,
    commentsEngine,
    cursorEngine,
    eventEngine,
    historyEngine,
    lockEngine,
    pointerEngine,
    presenceEngine,
    recordingEngine,
    stateEngine,
    viewportEngine,
  } as TestRoom;

  createRoomMock.mockImplementationOnce(
    (nextRoomId: string, nextOptions: RoomOptions<PresenceData>) => {
      expect(nextRoomId).toBe(roomId);
      expect(nextOptions).toEqual(expect.objectContaining(options));
      return room;
    },
  );

  return room;
}

/**
 * Configures a TestBed module with the room provider, eagerly instantiates the
 * room (so `provideRoomful` connects and wires callbacks), and returns helpers
 * to run injections inside the room's injection context.
 */
function setupRoom(
  roomId: string,
  providerOptions: Parameters<typeof provideRoomful>[1] = {},
): {
  run<T>(factory: () => T): T;
  destroy(): void;
} {
  TestBed.configureTestingModule({
    providers: [provideRoomful(roomId, providerOptions)],
  });

  // Eagerly resolve the room so the provider factory runs (connect + wiring).
  TestBed.inject(ROOMFUL_ROOM);

  return {
    run<T>(factory: () => T): T {
      return TestBed.runInInjectionContext(factory);
    },
    destroy(): void {
      TestBed.resetTestingModule();
    },
  };
}

beforeEach(() => {
  createRoomMock.mockReset();
  TestBed.resetTestingModule();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('provideRoomful', () => {
  it('creates a room during provider init, connects, and exposes it via injectRoom()', () => {
    const room = createMockRoom('provider-room', {
      transport: 'broadcast',
    });

    const env = setupRoom('provider-room', { transport: 'broadcast' });
    const injected = env.run(() => injectRoom());

    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(injected).toBe(room);
  });

  it('disconnects the room cleanly on injector destroy', () => {
    const room = createMockRoom('disconnect-room');

    const env = setupRoom('disconnect-room');
    env.destroy();

    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it('forwards connected, disconnected, and error events to provider callbacks', () => {
    const room = createMockRoom('callback-room');
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onError = vi.fn();

    setupRoom('callback-room', { onConnect, onDisconnect, onError });

    const error = new RoomfulError('NETWORK_ERROR', 'boom', true);

    room.emit('connected', undefined);
    room.emit('disconnected', { reason: 'manual' });
    room.emit('error', error);

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith({ reason: 'manual' });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('throws a typed error when injectRoom() is used without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectRoom());
    }).toThrowError(RoomfulError);
    expect(() => {
      TestBed.runInInjectionContext(() => injectRoom());
    }).toThrow('provideRoomful');
  });
});

describe('injectPresence', () => {
  it('returns self, others, all, and presence mutators', () => {
    const self = createPeer('presence-self', { name: 'Ada' });
    const other = createPeer('presence-other', { name: 'Grace', role: 'editor' });
    const presenceEngine = createMockPresenceEngine('presence-self', [self, other]);
    createMockRoom(
      'presence-room',
      {},
      {
        peerId: 'presence-self',
        presenceEngine,
      },
    );

    const env = setupRoom('presence-room');
    const result = env.run(() => injectPresence());

    expect(result.self()).toEqual(self);
    expect(result.others()).toEqual([other]);
    expect(result.all()).toEqual([self, other]);

    result.update({ status: 'online' });
    result.replace({ name: 'Ada Lovelace' });

    expect(presenceEngine.update).toHaveBeenCalledWith({ status: 'online' });
    expect(presenceEngine.replace).toHaveBeenCalledWith({ name: 'Ada Lovelace' });
  });

  it('reactively reflects peers joining, leaving, or meaningfully updating', () => {
    const self = createPeer('ng-self', { name: 'Self' });
    const peerA = createPeer('ng-peer-a', { name: 'Peer A' });
    const peerB = createPeer('ng-peer-b', { name: 'Peer B' });
    const presenceEngine = createMockPresenceEngine('ng-self', [self]);
    createMockRoom(
      'presence-reactivity',
      {},
      {
        peerId: 'ng-self',
        presenceEngine,
      },
    );

    const env = setupRoom('presence-reactivity');
    const result = env.run(() => injectPresence());

    expect(result.others()).toEqual([]);

    presenceEngine.emit([self, peerA]);
    expect(result.others().map((peer) => peer.id)).toEqual(['ng-peer-a']);

    presenceEngine.emit([self, peerA, peerB]);
    expect(result.others().map((peer) => peer.id)).toEqual(['ng-peer-a', 'ng-peer-b']);

    presenceEngine.emit([self, peerB]);
    expect(result.others().map((peer) => peer.id)).toEqual(['ng-peer-b']);
  });

  it('keeps stable slice references when an unrelated slice changes', () => {
    const self = createPeer('stable-self', { name: 'Self', role: 'owner' });
    const other = createPeer('stable-other', { name: 'Other', role: 'editor' });
    const presenceEngine = createMockPresenceEngine('stable-self', [self, other]);
    createMockRoom(
      'presence-stable-slices',
      {},
      {
        peerId: 'stable-self',
        presenceEngine,
      },
    );

    const env = setupRoom('presence-stable-slices');
    const result = env.run(() => injectPresence());

    const initialOthers = result.others();

    presenceEngine.emit([
      createPeer('stable-self', { name: 'Self Renamed', role: 'owner' }),
      createPeer('stable-other', { name: 'Other', role: 'editor' }),
    ]);

    expect(result.others()).toBe(initialOthers);
  });

  it('throws a typed error when injectPresence() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectPresence());
    }).toThrowError(RoomfulError);
  });
});

describe('injectPeers', () => {
  it('returns reactive remote peers and excludes the local peer', () => {
    const self = createPeer('peers-self', { name: 'Self' });
    const peerA = createPeer('peers-a', { name: 'Peer A' });
    const peerB = createPeer('peers-b', { name: 'Peer B' });
    const presenceEngine = createMockPresenceEngine('peers-self', [self, peerA]);
    createMockRoom(
      'peers-room',
      {},
      {
        peerId: 'peers-self',
        presenceEngine,
      },
    );

    const env = setupRoom('peers-room');
    const peers = env.run(() => injectPeers());

    expect(peers()).toEqual([peerA]);

    presenceEngine.emit([self, peerA, peerB]);

    expect(peers()).toEqual([peerA, peerB]);
  });
});

describe('injectAwareness', () => {
  it('returns remote awareness and forwards awareness mutators', () => {
    const self = createAwareness('awareness-self', {
      typing: true,
    });
    const other = createAwareness('awareness-other', {
      focus: 'editor-1',
      selection: {
        from: 1,
        to: 3,
        elementId: 'editor-1',
      },
      theme: 'dark',
    });
    const awarenessEngine = createMockAwarenessEngine([self, other]);
    createMockRoom(
      'awareness-room',
      {},
      {
        awarenessEngine,
        peerId: 'awareness-self',
      },
    );

    const env = setupRoom('awareness-room');
    const result = env.run(() => injectAwareness());

    expect(result.others()).toEqual([other]);

    result.set({ mode: 'draft' });
    result.setFocus('comment-1');
    result.setSelection({ from: 5, to: 8, elementId: 'comment-1' });
    result.setTyping(false);

    expect(awarenessEngine.set).toHaveBeenCalledWith({ mode: 'draft' });
    expect(awarenessEngine.setFocus).toHaveBeenCalledWith('comment-1');
    expect(awarenessEngine.setSelection).toHaveBeenCalledWith({
      from: 5,
      to: 8,
      elementId: 'comment-1',
    });
    expect(awarenessEngine.setTyping).toHaveBeenCalledWith(false);
  });

  it('reactively reflects remote awareness changes and skips self-only updates', () => {
    const self = createAwareness('awareness-reactive-self', { typing: false });
    const other = createAwareness('awareness-reactive-other', {
      focus: 'editor-1',
      metadata: { mode: 'draft' },
    });
    const awarenessEngine = createMockAwarenessEngine([self, other]);
    createMockRoom(
      'awareness-reactivity',
      {},
      {
        awarenessEngine,
        peerId: 'awareness-reactive-self',
      },
    );

    const env = setupRoom('awareness-reactivity');
    const result = env.run(() => injectAwareness());

    const initialOthers = result.others();

    awarenessEngine.emit([
      createAwareness('awareness-reactive-self', { typing: true }),
      createAwareness('awareness-reactive-other', {
        focus: 'editor-1',
        metadata: { mode: 'draft' },
      }),
    ]);

    expect(result.others()).toBe(initialOthers);

    awarenessEngine.emit([
      createAwareness('awareness-reactive-self', { typing: true }),
      createAwareness('awareness-reactive-other', {
        focus: 'editor-2',
        metadata: { mode: 'review' },
      }),
    ]);

    expect(result.others()).toEqual([
      createAwareness('awareness-reactive-other', {
        focus: 'editor-2',
        metadata: { mode: 'review' },
      }),
    ]);
  });
});

describe('injectConnectionStatus', () => {
  it('tracks room status transitions, including the initial connecting state', () => {
    const room = createMockRoom('connection-status-room');

    const env = setupRoom('connection-status-room');
    const status = env.run(() => injectConnectionStatus());

    expect(status()).toBe('connecting');

    room.emit('connected', undefined);
    expect(status()).toBe('connected');

    room.emit('reconnecting', { attempt: 1 });
    expect(status()).toBe('reconnecting');

    room.emit('disconnected', { reason: 'manual' });
    expect(status()).toBe('disconnected');

    room.emit('error', new RoomfulError('NETWORK_ERROR', 'boom', true));
    expect(status()).toBe('error');
  });

  it('removes its room listeners on injector destroy', () => {
    const room = createMockRoom('connection-status-cleanup');

    const env = setupRoom('connection-status-cleanup');
    env.run(() => injectConnectionStatus());

    env.destroy();

    expect(room.listenerCount('connected')).toBe(0);
    expect(room.listenerCount('reconnecting')).toBe(0);
    expect(room.listenerCount('disconnected')).toBe(0);
    expect(room.listenerCount('error')).toBe(0);
  });
});

describe('injectEvent', () => {
  it('subscribes once, emits outbound events, and delivers to the handler', () => {
    const eventEngine = createMockEventEngine();
    createMockRoom(
      'event-room',
      {},
      {
        eventEngine,
      },
    );
    const handler = vi.fn();

    const env = setupRoom('event-room');
    const emit = env.run(() => injectEvent<{ text: string }>('message', handler));

    emit({ text: 'outbound' });
    expect(eventEngine.emit).toHaveBeenCalledWith('message', { text: 'outbound' });

    eventEngine.deliver(
      'message',
      { text: 'inbound' },
      createPeer('sender-a', { name: 'Sender A' }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { text: 'inbound' },
      expect.objectContaining({ id: 'sender-a', name: 'Sender A' }),
    );
    expect(eventEngine.on).toHaveBeenCalledTimes(1);
    expect(eventEngine.subscriberCount('message')).toBe(1);
  });

  it('removes its event listener on injector destroy', () => {
    const eventEngine = createMockEventEngine();
    createMockRoom(
      'event-cleanup-room',
      {},
      {
        eventEngine,
      },
    );

    const env = setupRoom('event-cleanup-room');
    env.run(() => injectEvent('value', vi.fn()));

    expect(eventEngine.subscriberCount('value')).toBe(1);

    env.destroy();

    expect(eventEngine.subscriberCount('value')).toBe(0);
  });
});

describe('injectCursors', () => {
  it('returns cursors, mount, and unmount and tracks the mounted element', () => {
    const remoteCursor = createCursor('cursor-peer', { tool: 'pen' });
    const cursorEngine = createMockCursorEngine([remoteCursor]);
    createMockRoom(
      'cursor-room',
      {},
      {
        cursorEngine,
      },
    );

    const env = setupRoom('cursor-room');
    const result = env.run(() => injectCursors());

    const board = document.createElement('div');

    expect(result.cursors()).toEqual([remoteCursor]);
    expect(typeof result.mount).toBe('function');
    expect(typeof result.unmount).toBe('function');

    result.mount(board);
    expect(cursorEngine.mount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(board);

    result.unmount();
    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);

    result.mount(board);
    expect(cursorEngine.mount).toHaveBeenCalledTimes(2);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(board);

    env.destroy();
    expect(cursorEngine.unmount).toHaveBeenCalledTimes(2);
  });

  it('reactively reflects cursor snapshot changes and skips deep-equal updates', () => {
    const initialCursor = createCursor('cursor-peer', {
      tool: 'pen',
      metadata: { pressure: 0.5 },
    });
    const cursorEngine = createMockCursorEngine([initialCursor]);
    createMockRoom(
      'cursor-reactivity',
      {},
      {
        cursorEngine,
      },
    );

    const env = setupRoom('cursor-reactivity');
    const result = env.run(() => injectCursors());

    const initialSnapshot = result.cursors();

    cursorEngine.emit([
      createCursor('cursor-peer', {
        tool: 'pen',
        metadata: { pressure: 0.5 },
      }),
    ]);
    expect(result.cursors()).toBe(initialSnapshot);

    cursorEngine.emit([
      createCursor('cursor-peer', {
        x: 0.6,
        xAbsolute: 60,
        tool: 'pen',
        metadata: { pressure: 0.9 },
      }),
    ]);

    expect(result.cursors()[0]).toMatchObject({
      x: 0.6,
      xAbsolute: 60,
      metadata: { pressure: 0.9 },
    });
    expect(cursorEngine.subscriberCount()).toBe(1);
  });
});

describe('injectViewport', () => {
  it('returns states, mount, unmount, and controls and tracks the mounted element', () => {
    const remoteViewport = createViewport('viewport-peer', { scrollY: 0.5 });
    const viewportEngine = createMockViewportEngine([remoteViewport]);
    createMockRoom(
      'viewport-room',
      {},
      {
        viewportEngine,
      },
    );

    const env = setupRoom('viewport-room');
    const result = env.run(() => injectViewport());

    const board = document.createElement('div');

    expect(result.states()).toEqual([remoteViewport]);
    expect(typeof result.mount).toBe('function');
    expect(typeof result.unmount).toBe('function');

    result.mount(board);
    expect(viewportEngine.mount).toHaveBeenCalledTimes(1);
    expect(viewportEngine.mount).toHaveBeenLastCalledWith(board);

    result.unmount();
    expect(viewportEngine.unmount).toHaveBeenCalledTimes(1);

    result.mount(board);
    expect(viewportEngine.mount).toHaveBeenCalledTimes(2);
    expect(viewportEngine.mount).toHaveBeenLastCalledWith(board);

    result.broadcast();
    result.stopBroadcast();
    result.present();
    result.stopPresenting();
    result.follow('viewport-peer');
    result.unfollow();

    expect(viewportEngine.broadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopBroadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.present).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopPresenting).toHaveBeenCalledTimes(1);
    expect(viewportEngine.follow).toHaveBeenCalledWith('viewport-peer');
    expect(viewportEngine.unfollow).toHaveBeenCalledTimes(1);

    env.destroy();
    expect(viewportEngine.unmount).toHaveBeenCalledTimes(2);
  });

  it('reactively reflects viewport state changes and skips deep-equal updates', () => {
    const viewportEngine = createMockViewportEngine([
      createViewport('viewport-peer', { scrollY: 0.25 }),
    ]);
    createMockRoom(
      'viewport-reactivity',
      {},
      {
        viewportEngine,
      },
    );

    const env = setupRoom('viewport-reactivity');
    const result = env.run(() => injectViewport());

    const initialSnapshot = result.states();

    viewportEngine.emit([createViewport('viewport-peer', { scrollY: 0.25 })]);
    expect(result.states()).toBe(initialSnapshot);

    viewportEngine.emit([createViewport('viewport-peer', { scrollY: 0.9 })]);

    expect(result.states()[0]).toMatchObject({
      scrollY: 0.9,
    });
    expect(viewportEngine.subscriberCount()).toBe(1);
  });
});

describe('injectPointer', () => {
  it('returns beams, mount, unmount, and controls and tracks the mounted element', () => {
    const remoteBeam = createBeam('pointer-peer', { x: 0.4, y: 0.6 });
    const pointerEngine = createMockPointerEngine([remoteBeam]);
    createMockRoom(
      'pointer-room',
      {},
      {
        pointerEngine,
      },
    );

    const env = setupRoom('pointer-room');
    const result = env.run(() => injectPointer());

    const board = document.createElement('div');

    expect(result.beams()).toEqual([remoteBeam]);
    expect(typeof result.mount).toBe('function');
    expect(typeof result.unmount).toBe('function');

    result.mount(board);
    expect(pointerEngine.mount).toHaveBeenCalledTimes(1);
    expect(pointerEngine.mount).toHaveBeenLastCalledWith(board);

    result.unmount();
    expect(pointerEngine.unmount).toHaveBeenCalledTimes(1);

    result.mount(board);
    expect(pointerEngine.mount).toHaveBeenCalledTimes(2);
    expect(pointerEngine.mount).toHaveBeenLastCalledWith(board);

    result.activate();
    result.deactivate();
    const cleanup = result.render({ style: 'laser' });

    expect(pointerEngine.activate).toHaveBeenCalledTimes(1);
    expect(pointerEngine.deactivate).toHaveBeenCalledTimes(1);
    expect(pointerEngine.render).toHaveBeenCalledWith({ style: 'laser' });
    expect(typeof cleanup).toBe('function');

    env.destroy();
    expect(pointerEngine.unmount).toHaveBeenCalledTimes(2);
  });

  it('reactively reflects pointer beam changes and skips deep-equal updates', () => {
    const pointerEngine = createMockPointerEngine([createBeam('pointer-peer', { x: 0.1 })]);
    createMockRoom(
      'pointer-reactivity',
      {},
      {
        pointerEngine,
      },
    );

    const env = setupRoom('pointer-reactivity');
    const result = env.run(() => injectPointer());

    const initialSnapshot = result.beams();

    pointerEngine.emit([createBeam('pointer-peer', { x: 0.1 })]);
    expect(result.beams()).toBe(initialSnapshot);

    pointerEngine.emit([createBeam('pointer-peer', { x: 0.9 })]);

    expect(result.beams()[0]).toMatchObject({
      x: 0.9,
    });
    expect(pointerEngine.subscriberCount()).toBe(1);
  });
});

describe('injectLocks', () => {
  it('returns a locks signal and controls and reflects remote claims', () => {
    const lockEngine = createMockLockEngine();
    lockEngine.setHolder('cell-1', createPeer('owner-peer'));
    createMockRoom(
      'locks-room',
      {},
      {
        lockEngine,
      },
    );

    const env = setupRoom('locks-room');
    const result = env.run(() => injectLocks());

    expect(result.locks()).toEqual([expect.objectContaining({ key: 'cell-1' })]);
    expect(result.isLocked('cell-1')).toBe(true);
    expect(result.getHolder('cell-1')?.id).toBe('owner-peer');

    // A remote claim on a new key is reflected in the signal.
    lockEngine.emitAll([
      createLock('cell-1', createPeer('owner-peer')),
      createLock('cell-2', createPeer('peer-b')),
    ]);
    expect(result.locks().map((state) => state.key)).toEqual(['cell-1', 'cell-2']);
    expect(result.getHolder('cell-2')?.id).toBe('peer-b');

    void result.acquire('cell-3', { ttl: 1_000 });
    result.release('cell-1');
    result.releaseAll();

    expect(lockEngine.acquire).toHaveBeenCalledWith('cell-3', { ttl: 1_000 });
    expect(lockEngine.release).toHaveBeenCalledWith('cell-1');
    expect(lockEngine.releaseAll).toHaveBeenCalledTimes(1);
    expect(lockEngine.allSubscriberCount()).toBe(1);

    env.destroy();
    expect(lockEngine.allSubscriberCount()).toBe(0);
  });

  it('skips deep-equal lock snapshots', () => {
    const lockEngine = createMockLockEngine();
    createMockRoom(
      'locks-reactivity',
      {},
      {
        lockEngine,
      },
    );

    const env = setupRoom('locks-reactivity');
    const result = env.run(() => injectLocks());

    lockEngine.emitAll([createLock('cell-1', createPeer('owner-peer'))]);
    const heldSnapshot = result.locks();
    expect(heldSnapshot[0]).toMatchObject({ key: 'cell-1' });

    lockEngine.emitAll([createLock('cell-1', createPeer('owner-peer'))]);
    expect(result.locks()).toBe(heldSnapshot);
  });

  it('throws a typed error when injectLocks() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectLocks());
    }).toThrowError(RoomfulError);
  });
});

describe('injectComments', () => {
  it('returns a threads signal and controls and reflects added and remote threads', async () => {
    const commentsEngine = createMockCommentsEngine([
      createCommentThread('seed', { text: 'Seed thread' }),
    ]);
    createMockRoom(
      'comments-room',
      {},
      {
        commentsEngine,
      },
    );

    const env = setupRoom('comments-room');
    const result = env.run(() => injectComments());

    expect(result.threads()).toEqual([expect.objectContaining({ id: 'seed' })]);

    // Adding a thread is reflected in the signal.
    await result.add({ anchor: { elementId: 'cell-1' }, text: 'New thread' });
    expect(commentsEngine.add).toHaveBeenCalledWith({
      anchor: { elementId: 'cell-1' },
      text: 'New thread',
    });
    expect(result.threads().map((thread) => thread.id)).toEqual(['seed', 'thread-2']);

    await result.reply('seed', 'A reply');
    await result.resolve('seed');
    await result.reopen('seed');

    expect(commentsEngine.reply).toHaveBeenCalledWith('seed', 'A reply');
    expect(commentsEngine.resolve).toHaveBeenCalledWith('seed');
    expect(commentsEngine.reopen).toHaveBeenCalledWith('seed');

    // A remote thread change is reflected in the signal.
    commentsEngine.emit([
      createCommentThread('seed', { text: 'Seed thread' }),
      createCommentThread('remote', { text: 'Remote thread' }),
    ]);
    expect(result.threads().map((thread) => thread.id)).toEqual(['seed', 'remote']);
    expect(result.getOpen()).toHaveLength(2);
    expect(commentsEngine.subscriberCount()).toBe(1);

    env.destroy();
    expect(commentsEngine.subscriberCount()).toBe(0);
  });

  it('skips deep-equal comment snapshots', () => {
    const commentsEngine = createMockCommentsEngine([createCommentThread('seed')]);
    createMockRoom(
      'comments-reactivity',
      {},
      {
        commentsEngine,
      },
    );

    const env = setupRoom('comments-reactivity');
    const result = env.run(() => injectComments());

    const initialSnapshot = result.threads();

    commentsEngine.emit([createCommentThread('seed')]);
    expect(result.threads()).toBe(initialSnapshot);
  });

  it('throws a typed error when injectComments() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectComments());
    }).toThrowError(RoomfulError);
  });
});

describe('injectActivity', () => {
  it('returns an entries signal and record and reflects recorded and remote entries', () => {
    const activityEngine = createMockActivityEngine([
      createActivityEntry('seed', { type: 'seed' }),
    ]);
    createMockRoom(
      'activity-room',
      {},
      {
        activityEngine,
      },
    );

    const env = setupRoom('activity-room');
    const result = env.run(() => injectActivity());

    expect(result.entries()).toEqual([expect.objectContaining({ id: 'seed' })]);

    // Recording an entry is reflected newest-first in the signal.
    result.record('comment:added', { n: 1 });
    expect(activityEngine.record).toHaveBeenCalledWith('comment:added', { n: 1 });
    expect(result.entries()[0]).toEqual(expect.objectContaining({ type: 'comment:added' }));

    // A remote entry is reflected in the signal.
    activityEngine.emit([
      createActivityEntry('remote', { type: 'record:locked', timestamp: 9 }),
      createActivityEntry('seed', { type: 'seed' }),
    ]);
    expect(result.entries().map((entry) => entry.id)).toEqual(['remote', 'seed']);
    expect(activityEngine.subscriberCount()).toBe(1);

    env.destroy();
    expect(activityEngine.subscriberCount()).toBe(0);
  });

  it('skips deep-equal activity snapshots', () => {
    const activityEngine = createMockActivityEngine([createActivityEntry('seed')]);
    createMockRoom(
      'activity-reactivity',
      {},
      {
        activityEngine,
      },
    );

    const env = setupRoom('activity-reactivity');
    const result = env.run(() => injectActivity());

    const initialSnapshot = result.entries();

    activityEngine.emit([createActivityEntry('seed')]);
    expect(result.entries()).toBe(initialSnapshot);
  });

  it('throws a typed error when injectActivity() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectActivity());
    }).toThrowError(RoomfulError);
  });
});

describe('injectFieldPresence', () => {
  it('returns a fields signal and controls and reflects remote changes', () => {
    const fieldPresenceEngine = createMockFieldPresenceEngine([
      createFieldPresenceState('email', ['peer-a']),
    ]);
    createMockRoom(
      'field-room',
      {},
      {
        fieldPresenceEngine,
      },
    );

    const env = setupRoom('field-room');
    const result = env.run(() => injectFieldPresence());

    expect(result.fields()).toEqual([expect.objectContaining({ fieldId: 'email' })]);
    expect(result.getFieldPeers('email').map((peer) => peer.id)).toEqual(['peer-a']);
    expect(result.getFieldPeers('missing')).toEqual([]);

    result.setActiveField('name');
    expect(fieldPresenceEngine.setActiveField).toHaveBeenCalledWith('name');

    // A remote change is reflected in the signal.
    fieldPresenceEngine.emit([
      createFieldPresenceState('email', ['peer-a']),
      createFieldPresenceState('name', ['peer-b']),
    ]);
    expect(result.fields().map((field) => field.fieldId)).toEqual(['email', 'name']);
    expect(result.getFieldPeers('name').map((peer) => peer.id)).toEqual(['peer-b']);
    expect(fieldPresenceEngine.subscriberCount()).toBe(1);

    env.destroy();
    expect(fieldPresenceEngine.subscriberCount()).toBe(0);
  });

  it('skips deep-equal field-presence snapshots', () => {
    const fieldPresenceEngine = createMockFieldPresenceEngine([
      createFieldPresenceState('email', ['peer-a']),
    ]);
    createMockRoom(
      'field-reactivity',
      {},
      {
        fieldPresenceEngine,
      },
    );

    const env = setupRoom('field-reactivity');
    const result = env.run(() => injectFieldPresence());

    const initialSnapshot = result.fields();

    fieldPresenceEngine.emit([createFieldPresenceState('email', ['peer-a'])]);
    expect(result.fields()).toBe(initialSnapshot);
  });

  it('throws a typed error when injectFieldPresence() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectFieldPresence());
    }).toThrowError(RoomfulError);
  });
});

describe('injectHistory', () => {
  it('returns a timeline signal and controls and reflects captures and remote entries', async () => {
    const historyEngine = createMockHistoryEngine([
      createTimelineEntry('seed', { action: 'draw' }),
    ]);
    createMockRoom(
      'history-room',
      {},
      {
        historyEngine,
      },
    );

    const env = setupRoom('history-room');
    const result = env.run(() => injectHistory());

    expect(result.timeline()).toEqual([expect.objectContaining({ id: 'seed' })]);
    expect(result.canUndo()).toBe(false);
    expect(result.canRedo()).toBe(false);

    // capture appends a timeline entry reactively.
    result.capture('move', 'Moved a shape');
    expect(historyEngine.capture).toHaveBeenCalledWith('move', 'Moved a shape');
    expect(result.timeline().map((entry) => entry.id)).toEqual(['seed', 'entry-2']);

    // transaction wraps a mutation and flips canUndo.
    const wrapped = vi.fn();
    result.transaction('add-shape', wrapped);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(historyEngine.transaction).toHaveBeenCalledWith('add-shape', wrapped);
    expect(result.canUndo()).toBe(true);

    await result.undo();
    expect(historyEngine.undo).toHaveBeenCalledTimes(1);
    expect(result.canUndo()).toBe(false);
    expect(result.canRedo()).toBe(true);

    await result.redo();
    expect(historyEngine.redo).toHaveBeenCalledTimes(1);
    expect(result.canUndo()).toBe(true);

    // A remote timeline change is reflected in the signal.
    historyEngine.emit([
      createTimelineEntry('seed', { action: 'draw' }),
      createTimelineEntry('remote', { action: 'erase' }),
    ]);
    expect(result.timeline().map((entry) => entry.id)).toEqual(['seed', 'remote']);
    expect(historyEngine.subscriberCount()).toBe(1);

    env.destroy();
    expect(historyEngine.subscriberCount()).toBe(0);
  });

  it('skips deep-equal timeline snapshots', () => {
    const historyEngine = createMockHistoryEngine([createTimelineEntry('seed')]);
    createMockRoom(
      'history-reactivity',
      {},
      {
        historyEngine,
      },
    );

    const env = setupRoom('history-reactivity');
    const result = env.run(() => injectHistory());

    const initialSnapshot = result.timeline();

    historyEngine.emit([createTimelineEntry('seed')]);
    expect(result.timeline()).toBe(initialSnapshot);
  });

  it('throws a typed error when injectHistory() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectHistory());
    }).toThrowError(RoomfulError);
  });
});

describe('injectRecording', () => {
  it('returns recorder-state signals and controls and reflects emitted state', () => {
    const recordingEngine = createMockRecordingEngine();
    createMockRoom(
      'recording-room',
      {},
      {
        recordingEngine,
      },
    );

    const env = setupRoom('recording-room');
    const result = env.run(() => injectRecording());

    // Seeded from the initial getState().
    expect(result.isRecording()).toBe(false);
    expect(result.frameCount()).toBe(0);
    expect(result.durationMs()).toBe(0);

    // start/stop forward to the engine.
    result.start();
    result.stop();
    expect(recordingEngine.start).toHaveBeenCalledTimes(1);
    expect(recordingEngine.stop).toHaveBeenCalledTimes(1);

    // An emitted recorder state updates all three signals reactively.
    recordingEngine.emit({ isRecording: true, frameCount: 3, durationMs: 120 });
    expect(result.isRecording()).toBe(true);
    expect(result.frameCount()).toBe(3);
    expect(result.durationMs()).toBe(120);

    // exportRecording and replay forward to the engine.
    const recording = result.exportRecording();
    expect(recordingEngine.export).toHaveBeenCalledTimes(1);
    expect(recording).toMatchObject({ version: 1, roomId: 'room-rec' });

    result.replay(recording);
    expect(recordingEngine.replay).toHaveBeenCalledWith(recording);
    expect(recordingEngine.subscriberCount()).toBe(1);

    env.destroy();
    expect(recordingEngine.subscriberCount()).toBe(0);
  });

  it('throws a typed error when injectRecording() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectRecording());
    }).toThrowError(RoomfulError);
  });
});

describe('injectLockState', () => {
  it('tracks a single key and transitions free to held to free', () => {
    const lockEngine = createMockLockEngine();
    createMockRoom(
      'lock-state-room',
      {},
      {
        lockEngine,
      },
    );

    const env = setupRoom('lock-state-room');
    const result = env.run(() => injectLockState('cell-1'));

    // Initially free.
    expect(result()).toBeNull();

    lockEngine.emitKey('cell-1', createLock('cell-1', createPeer('owner-peer')));
    expect(result()).toMatchObject({ key: 'cell-1', holder: { id: 'owner-peer' } });

    lockEngine.emitKey('cell-1', createLock('cell-1', null));
    expect(result()).toBeNull();

    expect(lockEngine.keySubscriberCount('cell-1')).toBe(1);

    env.destroy();
    expect(lockEngine.keySubscriberCount('cell-1')).toBe(0);
  });

  it('throws a typed error when injectLockState() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() => injectLockState('cell-1'));
    }).toThrowError(RoomfulError);
  });
});

describe('injectSharedState', () => {
  it('returns [signal, setValue], forwards options, and supports direct and updater writes', () => {
    const stateEngine = createMockStateEngine({
      count: 0,
      nested: { enabled: true },
    });
    const room = createMockRoom(
      'shared-state-room',
      {},
      {
        stateEngine,
      },
    );

    const env = setupRoom('shared-state-room');
    const [value, setValue] = env.run(() =>
      injectSharedState('shared-count', {
        initialValue: { count: 0, nested: { enabled: true } },
        strategy: 'crdt',
        persist: false,
      }),
    );

    expect(value()).toEqual({ count: 0, nested: { enabled: true } });
    expect(room.useState.mock.calls[0]?.[0]).toEqual({
      initialValue: { count: 0, nested: { enabled: true } },
      strategy: 'crdt',
      persist: false,
    });

    setValue({ count: 3, nested: { enabled: false } });
    expect(stateEngine.set).toHaveBeenCalledWith({ count: 3, nested: { enabled: false } });
    expect(value()).toEqual({ count: 3, nested: { enabled: false } });

    setValue((previous) => {
      return { count: previous.count + 2, nested: previous.nested };
    });
    expect(stateEngine.set).toHaveBeenLastCalledWith({ count: 5, nested: { enabled: false } });
    expect(value()).toEqual({ count: 5, nested: { enabled: false } });

    const setCallsBeforeNoop = stateEngine.set.mock.calls.length;
    setValue((previous) => {
      return { count: previous.count, nested: { enabled: previous.nested.enabled } };
    });
    expect(stateEngine.set).toHaveBeenCalledTimes(setCallsBeforeNoop);
  });

  it('reactively reflects local and remote state changes and skips deep-equal snapshots', () => {
    const stateEngine = createMockStateEngine({
      votes: { yes: 1, no: 0 },
    });
    createMockRoom(
      'shared-state-reactivity',
      {},
      {
        stateEngine,
      },
    );

    const env = setupRoom('shared-state-reactivity');
    const [value, setValue] = env.run(() =>
      injectSharedState('poll-state', {
        initialValue: { votes: { yes: 1, no: 0 } },
      }),
    );

    setValue((previous) => {
      return { votes: { yes: previous.votes.yes + 1, no: previous.votes.no } };
    });
    expect(value()).toEqual({ votes: { yes: 2, no: 0 } });

    stateEngine.emit({ votes: { yes: 2, no: 0 } });
    const stableSnapshot = value();

    stateEngine.emit({ votes: { yes: 2, no: 1 } });
    expect(value()).toEqual({ votes: { yes: 2, no: 1 } });
    expect(value()).not.toBe(stableSnapshot);
  });

  it('allows multiple consumers in the same room when key and options are compatible', () => {
    const stateEngine = createMockStateEngine({ score: 1 });
    createMockRoom(
      'shared-state-multi',
      {},
      {
        stateEngine,
      },
    );

    const env = setupRoom('shared-state-multi');
    const [first, setFirst] = env.run(() =>
      injectSharedState('game-state', { initialValue: { score: 1 }, strategy: 'lww' }),
    );
    const [second] = env.run(() =>
      injectSharedState('game-state', { initialValue: { score: 1 }, strategy: 'lww' }),
    );

    expect(first()).toEqual({ score: 1 });
    expect(second()).toEqual({ score: 1 });

    setFirst({ score: 2 });
    expect(first()).toEqual({ score: 2 });
  });

  it('throws when the same room is bound to a different key', () => {
    createMockRoom('shared-state-key-mismatch');

    const env = setupRoom('shared-state-key-mismatch');
    env.run(() => injectSharedState('first-key', { initialValue: { count: 0 } }));

    expect(() => {
      env.run(() => injectSharedState('second-key', { initialValue: { count: 0 } }));
    }).toThrow('already bound to key');
  });

  it('throws when the same room receives an incompatible initialValue', () => {
    createMockRoom('shared-state-option-mismatch');

    const env = setupRoom('shared-state-option-mismatch');
    env.run(() => injectSharedState('state-key', { initialValue: { count: 0 }, strategy: 'lww' }));

    expect(() => {
      env.run(() => injectSharedState('state-key', { initialValue: { count: 1 } }));
    }).toThrow('different initialValue');
  });

  it('throws a typed error when injectSharedState() is called without provideRoomful', () => {
    expect(() => {
      TestBed.runInInjectionContext(() =>
        injectSharedState('outside-provider', { initialValue: { count: 0 } }),
      );
    }).toThrowError(RoomfulError);
  });
});
