// @vitest-environment jsdom

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
import type { Action } from 'svelte/action';
import type { Writable } from 'svelte/store';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const { createRoomMock, lifecycleState } = vi.hoisted(() => {
  return {
    createRoomMock: vi.fn(),
    lifecycleState: {
      destroyCallbacks: [] as Array<() => void>,
      failRegistration: false,
      mountCallbacks: [] as Array<() => void>,
    },
  };
});

vi.mock('svelte', async () => {
  const actual = await vi.importActual<typeof import('svelte')>('svelte');

  return {
    ...actual,
    onDestroy: vi.fn((callback: () => void) => {
      if (lifecycleState.failRegistration) {
        throw new Error('lifecycle unavailable');
      }

      lifecycleState.destroyCallbacks.push(callback);
    }),
    onMount: vi.fn((callback: () => void) => {
      if (lifecycleState.failRegistration) {
        throw new Error('lifecycle unavailable');
      }

      lifecycleState.mountCallbacks.push(callback);
    }),
  };
});

vi.mock('@roomful/core', async () => {
  const actual = await vi.importActual<typeof import('@roomful/core')>('@roomful/core');

  return {
    ...actual,
    createRoom: createRoomMock,
  };
});

import type { AwarenessStoreValue, EventChannelValue, PresenceStoreValue } from './index';
import { roomful } from './index';

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
  replace: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
  subscribe: ReturnType<typeof vi.fn<(cb: PresenceSubscriber) => () => void>>;
  update: ReturnType<typeof vi.fn<(data: Partial<PresenceData>) => void>>;
};

type TestCursorEngine = CursorEngine<CursorData> & {
  emit(positions: CursorPosition<CursorData>[]): void;
  getPositions: ReturnType<typeof vi.fn<() => CursorPosition<CursorData>[]>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  render: ReturnType<typeof vi.fn<() => void>>;
  setPosition: ReturnType<typeof vi.fn<(position: Partial<CursorPosition<CursorData>>) => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: CursorSubscriber) => () => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
};

type TestViewportEngine = ViewportEngine & {
  broadcast: ReturnType<typeof vi.fn<() => void>>;
  emit(states: ViewportState[]): void;
  follow: ReturnType<typeof vi.fn<(peerId: string) => void>>;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  present: ReturnType<typeof vi.fn<() => void>>;
  stopBroadcast: ReturnType<typeof vi.fn<() => void>>;
  stopPresenting: ReturnType<typeof vi.fn<() => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: ViewportSubscriber) => () => void>>;
  unfollow: ReturnType<typeof vi.fn<() => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
};

type TestPointerEngine = PointerEngine & {
  activate: ReturnType<typeof vi.fn<() => void>>;
  deactivate: ReturnType<typeof vi.fn<() => void>>;
  emit(beams: PointerBeam[]): void;
  mount: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>;
  render: ReturnType<typeof vi.fn<() => () => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: PointerSubscriber) => () => void>>;
  unmount: ReturnType<typeof vi.fn<() => void>>;
};

type TestLockEngine = LockEngine & {
  acquire: ReturnType<typeof vi.fn<(key: string) => Promise<boolean>>>;
  allSubscriberCount(): number;
  emitAll(states: LockState[]): void;
  emitKey(key: string, state: LockState): void;
  keySubscriberCount(key: string): number;
  release: ReturnType<typeof vi.fn<(key: string) => void>>;
  releaseAll: ReturnType<typeof vi.fn<() => void>>;
  setHolder(key: string, holder: Peer<PresenceData> | null): void;
};

type TestCommentsEngine = CommentsEngine & {
  add: ReturnType<
    typeof vi.fn<(input: { anchor: CommentAnchor; text: string }) => Promise<CommentThread>>
  >;
  emit(threads: CommentThread[]): void;
  reopen: ReturnType<typeof vi.fn<(threadId: string) => Promise<CommentThread>>>;
  reply: ReturnType<typeof vi.fn<(threadId: string, text: string) => Promise<CommentThread>>>;
  resolve: ReturnType<typeof vi.fn<(threadId: string) => Promise<CommentThread>>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: CommentsSubscriber) => () => void>>;
};

type TestActivityEngine = ActivityEngine & {
  emit(entries: ActivityEntry[]): void;
  record: ReturnType<typeof vi.fn<ActivityEngine['record']>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: ActivitySubscriber) => () => void>>;
};

type FieldPresenceSubscriber = (fields: FieldPresenceState[]) => void;

type TestFieldPresenceEngine = FieldPresenceEngine & {
  emit(fields: FieldPresenceState[]): void;
  setActiveField: ReturnType<typeof vi.fn<FieldPresenceEngine['setActiveField']>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: FieldPresenceSubscriber) => () => void>>;
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

type TestAwarenessEngine = AwarenessEngine & {
  emit(peers: AwarenessState[]): void;
  set: ReturnType<typeof vi.fn<(value: Record<string, unknown>) => void>>;
  setFocus: ReturnType<typeof vi.fn<(elementId: string | null) => void>>;
  setSelection: ReturnType<typeof vi.fn<(selection: AwarenessState['selection'] | null) => void>>;
  setTyping: ReturnType<typeof vi.fn<(isTyping: boolean) => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: AwarenessSubscriber) => () => void>>;
};

type TestEventEngine = EventEngine<PresenceData> & {
  deliver(name: string, payload: unknown, from?: Peer<PresenceData>): void;
  emit: ReturnType<typeof vi.fn<(name: string, payload: unknown) => void>>;
  emitTo: ReturnType<typeof vi.fn<(peerId: string, name: string, payload: unknown) => void>>;
  on: ReturnType<typeof vi.fn<(name: string, cb: EventSubscriber) => () => void>>;
  subscriberCount(name: string): number;
};

type TestStateEngine<T> = StateEngine<T> & {
  emit(value: T, meta?: StateChangeMeta): void;
  get: ReturnType<typeof vi.fn<() => T>>;
  set: ReturnType<typeof vi.fn<(value: T) => void>>;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: StateSubscriber<T>) => () => void>>;
};

type TestRoom = Room<PresenceData> & {
  awarenessEngine: TestAwarenessEngine;
  commentsEngine: TestCommentsEngine;
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  cursorEngine: TestCursorEngine;
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  emit: <TEvent extends RoomEventName>(
    event: TEvent,
    payload: RoomEventMap<PresenceData>[TEvent],
  ) => void;
  eventEngine: TestEventEngine;
  historyEngine: TestHistoryEngine;
  listenerCount(event: RoomEventName): number;
  lockEngine: TestLockEngine;
  pointerEngine: TestPointerEngine;
  presenceEngine: TestPresenceEngine;
  recordingEngine: TestRecordingEngine;
  setStatus(status: RoomStatus): void;
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
    color: '#111111',
    idle: false,
    name: userId,
    userId,
    x: 0.25,
    xAbsolute: 25,
    y: 0.75,
    yAbsolute: 75,
    ...overrides,
  };
}

function createAwareness(peerId: string, overrides: Partial<AwarenessState> = {}): AwarenessState {
  return {
    peerId,
    ...overrides,
  };
}

function cloneTestValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value;
}

function createStateMeta(overrides: Partial<StateChangeMeta> = {}): StateChangeMeta {
  return {
    changedBy: 'peer-state',
    reason: 'set',
    timestamp: 1,
    pending: false,
    queuedMutationCount: 0,
    ...overrides,
  };
}

function createMockPresenceEngine(
  selfPeerId: string,
  peers: Peer<PresenceData>[],
): TestPresenceEngine {
  const subscribers = new Set<PresenceSubscriber>();
  let currentPeers = peers;

  const emit = (nextPeers: Peer<PresenceData>[]): void => {
    currentPeers = nextPeers;
    for (const subscriber of subscribers) {
      subscriber(currentPeers);
    }
  };

  const engine = {
    replace: vi.fn((data: Partial<PresenceData>) => {
      currentPeers = currentPeers.map((peer) => {
        if (peer.id !== selfPeerId) {
          return peer;
        }

        return {
          id: peer.id,
          joinedAt: peer.joinedAt,
          lastSeen: peer.lastSeen,
          ...data,
        };
      });
    }),
    subscribe: vi.fn((callback: PresenceSubscriber) => {
      subscribers.add(callback);
      callback(currentPeers);

      return () => {
        subscribers.delete(callback);
      };
    }),
    update: vi.fn((data: Partial<PresenceData>) => {
      currentPeers = currentPeers.map((peer) => {
        if (peer.id !== selfPeerId) {
          return peer;
        }

        return {
          ...peer,
          ...data,
        };
      });
    }),
    emit,
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
    subscriberCount() {
      return subscribers.size;
    },
  } as TestPresenceEngine;

  return engine;
}

function createMockAwarenessEngine(peers: AwarenessState[] = []): TestAwarenessEngine {
  const subscribers = new Set<AwarenessSubscriber>();
  let currentPeers = peers;
  const selfPeerId = currentPeers[0]?.peerId ?? 'awareness-self';

  const emit = (nextPeers: AwarenessState[]): void => {
    currentPeers = nextPeers;
    for (const subscriber of subscribers) {
      subscriber(currentPeers);
    }
  };

  const updateSelf = (patch: Record<string, unknown>): void => {
    let foundSelf = false;
    currentPeers = currentPeers.map((entry) => {
      if (entry.peerId !== selfPeerId) {
        return entry;
      }

      foundSelf = true;
      return {
        ...entry,
        ...patch,
        peerId: selfPeerId,
      };
    });

    if (!foundSelf) {
      currentPeers = [{ peerId: selfPeerId, ...patch }, ...currentPeers];
    }
  };

  const engine = {
    emit,
    set: vi.fn((value: Record<string, unknown>) => {
      updateSelf(value);
    }),
    setFocus: vi.fn((elementId: string | null) => {
      updateSelf({ focus: elementId });
    }),
    setSelection: vi.fn((selection: AwarenessState['selection'] | null) => {
      updateSelf({ selection });
    }),
    setTyping: vi.fn((isTyping: boolean) => {
      updateSelf({ typing: isTyping });
    }),
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
    emit(nextPositions: CursorPosition<CursorData>[]) {
      currentPositions = nextPositions;
      for (const subscriber of subscribers) {
        subscriber(currentPositions);
      }
    },
    getPositions: vi.fn(() => {
      return currentPositions;
    }),
    mount: vi.fn(),
    render: vi.fn(),
    setPosition: vi.fn(),
    subscribe: vi.fn((callback: CursorSubscriber) => {
      subscribers.add(callback);
      callback(currentPositions);

      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
    unmount: vi.fn(),
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
    broadcast: vi.fn(),
    emit(nextStates: ViewportState[]) {
      currentStates = nextStates;
      for (const subscriber of subscribers) {
        subscriber(currentStates);
      }
    },
    follow: vi.fn(),
    get(peerId: string) {
      return currentStates.find((state) => {
        return state.peerId === peerId;
      });
    },
    getAll() {
      return currentStates;
    },
    mount: vi.fn(),
    present: vi.fn(),
    stopBroadcast: vi.fn(),
    stopPresenting: vi.fn(),
    subscribe: vi.fn((callback: ViewportSubscriber) => {
      subscribers.add(callback);
      callback(currentStates);

      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
    unfollow: vi.fn(),
    unmount: vi.fn(),
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
    activate: vi.fn(),
    deactivate: vi.fn(),
    emit(nextBeams: PointerBeam[]) {
      currentBeams = nextBeams;
      for (const subscriber of subscribers) {
        subscriber(currentBeams);
      }
    },
    getAll() {
      return currentBeams;
    },
    mount: vi.fn(),
    render: vi.fn(() => {
      return () => undefined;
    }),
    subscribe: vi.fn((callback: PointerSubscriber) => {
      subscribers.add(callback);
      callback(currentBeams);

      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
    unmount: vi.fn(),
  } as TestPointerEngine;

  return engine;
}

function createLock(key: string, holder: Peer<PresenceData> | null = null): LockState {
  return {
    acquiredAt: holder ? 1 : 0,
    expiresAt: null,
    holder,
    key,
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
    allSubscriberCount() {
      return allSubscribers.size;
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
    emitKey(key: string, state: LockState) {
      holders.set(key, state);
      for (const subscriber of keySubscribers.get(key) ?? []) {
        subscriber(state);
      }
    },
    getAll() {
      return collectAll();
    },
    getHolder(key: string) {
      return stateFor(key).holder;
    },
    isLocked(key: string) {
      return stateFor(key).holder !== null;
    },
    keySubscriberCount(key: string) {
      return keySubscribers.get(key)?.size ?? 0;
    },
    release: vi.fn(),
    releaseAll: vi.fn(),
    setHolder(key: string, holder: Peer<PresenceData> | null) {
      holders.set(key, createLock(key, holder));
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
  } as TestLockEngine;

  return engine;
}

function createCommentThread(id: string, overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    anchor: { elementId: `element-${id}` },
    author: createPeer(`author-${id}`),
    createdAt: 1,
    id,
    replies: [],
    resolved: false,
    text: `thread ${id}`,
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
    action: id,
    description: id,
    id,
    peerId: `peer-${id}`,
    peerName: `Peer ${id}`,
    timestamp: 1,
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
    durationMs: 0,
    frameCount: 0,
    isRecording: false,
    ...overrides,
  };
}

function createMockRecordingEngine(
  initialState: RecordingState = createRecordingState(),
): TestRecordingEngine {
  const subscribers = new Set<RecordingSubscriber>();
  let currentState = initialState;

  const engine = {
    emit(nextState: RecordingState) {
      currentState = nextState;
      for (const subscriber of subscribers) {
        subscriber(currentState);
      }
    },
    export: vi.fn(() => {
      return {
        durationMs: currentState.durationMs,
        frames: [],
        peerId: 'recording-peer',
        roomId: 'recording-room',
        startedAt: 0,
        version: 1,
      } as RoomfulRecording;
    }),
    getState() {
      return currentState;
    },
    replay: vi.fn(() => {
      return {
        play: vi.fn(),
        stop: vi.fn(),
        subscribe: vi.fn(() => {
          return () => undefined;
        }),
      } as ReplaySession;
    }),
    start: vi.fn(),
    stop: vi.fn(),
    subscribe: vi.fn((callback: RecordingSubscriber) => {
      subscribers.add(callback);
      callback(currentState);

      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
  } as TestRecordingEngine;

  return engine;
}

function createMockEventEngine(): TestEventEngine {
  const subscribers = new Map<string, Set<EventSubscriber>>();

  const engine = {
    deliver(name: string, payload: unknown, from = createPeer('event-source')) {
      for (const subscriber of subscribers.get(name) ?? []) {
        subscriber(payload, from);
      }
    },
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
    off: vi.fn(),
    subscriberCount(name: string) {
      return subscribers.get(name)?.size ?? 0;
    },
  } as TestEventEngine;

  return engine;
}

function createMockStateEngine<T>(initialValue: T): TestStateEngine<T> {
  const subscribers = new Set<StateSubscriber<T>>();
  let currentValue = cloneTestValue(initialValue);

  const engine = {
    emit(nextValue: T, meta: StateChangeMeta = createStateMeta()) {
      currentValue = cloneTestValue(nextValue);
      for (const subscriber of subscribers) {
        subscriber(engine.get(), meta);
      }
    },
    get: vi.fn(() => {
      return cloneTestValue(currentValue);
    }),
    patch: vi.fn(),
    reset: vi.fn(),
    set: vi.fn((nextValue: T) => {
      currentValue = cloneTestValue(nextValue);
      for (const subscriber of subscribers) {
        subscriber(engine.get(), createStateMeta({ changedBy: 'local' }));
      }
    }),
    subscribe: vi.fn((callback: StateSubscriber<T>) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    }),
    subscriberCount() {
      return subscribers.size;
    },
    undo: vi.fn(),
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
    stateEngine?: TestStateEngine<unknown>;
    status?: RoomStatus;
    viewportEngine?: TestViewportEngine;
  } = {},
): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();
  const peerId = config.peerId ?? `${roomId}-peer`;
  const activityEngine = config.activityEngine ?? createMockActivityEngine();
  const fieldPresenceEngine = config.fieldPresenceEngine ?? createMockFieldPresenceEngine();
  const awarenessEngine =
    config.awarenessEngine ?? createMockAwarenessEngine([createAwareness(peerId)]);
  const commentsEngine = config.commentsEngine ?? createMockCommentsEngine();
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const eventEngine = config.eventEngine ?? createMockEventEngine();
  const historyEngine = config.historyEngine ?? createMockHistoryEngine();
  const recordingEngine = config.recordingEngine ?? createMockRecordingEngine();
  const lockEngine = config.lockEngine ?? createMockLockEngine();
  const stateEngine = config.stateEngine ?? createMockStateEngine({});
  const viewportEngine = config.viewportEngine ?? createMockViewportEngine();
  const pointerEngine = config.pointerEngine ?? createMockPointerEngine();
  const presenceEngine =
    config.presenceEngine ?? createMockPresenceEngine(peerId, [createPeer(peerId)]);
  let currentStatus = config.status ?? 'idle';

  const room = {
    awarenessEngine,
    commentsEngine,
    connect: vi.fn(async () => {
      currentStatus = 'connected';
    }),
    cursorEngine,
    disconnect: vi.fn(async () => {
      currentStatus = 'disconnected';
    }),
    emit<TEvent extends RoomEventName>(event: TEvent, payload: RoomEventMap<PresenceData>[TEvent]) {
      switch (event) {
        case 'connected':
          currentStatus = 'connected';
          break;
        case 'disconnected':
          currentStatus = 'disconnected';
          break;
        case 'error':
          currentStatus = 'error';
          break;
        case 'reconnecting':
          currentStatus = 'reconnecting';
          break;
        default:
          break;
      }

      for (const handler of handlers.get(event) ?? []) {
        handler(payload);
      }
    },
    eventEngine,
    historyEngine,
    get peerCount() {
      return room.peers.length;
    },
    get peers() {
      return presenceEngine.getAll().filter((peer) => {
        return peer.id !== peerId;
      });
    },
    get status() {
      return currentStatus;
    },
    getYDoc: vi.fn(),
    getYProvider: vi.fn(),
    id: roomId,
    listenerCount(event: RoomEventName) {
      return handlers.get(event)?.size ?? 0;
    },
    lockEngine,
    off: vi.fn((event: RoomEventName, handler: RoomEventHandler) => {
      handlers.get(event)?.delete(handler);
    }),
    on: vi.fn((event: RoomEventName, handler: RoomEventHandler) => {
      const eventHandlers = handlers.get(event) ?? new Set<RoomEventHandler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);

      return () => {
        eventHandlers.delete(handler);
      };
    }),
    peerId,
    pointerEngine,
    presenceEngine,
    recordingEngine,
    setStatus(status: RoomStatus) {
      currentStatus = status;
    },
    stateEngine,
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
    useAwareness: vi.fn(() => {
      return awarenessEngine;
    }),
    useComments: vi.fn(() => {
      return commentsEngine;
    }),
    useCursors: vi.fn(() => {
      return cursorEngine;
    }),
    useEvents: vi.fn(() => {
      return eventEngine;
    }),
    useHistory: vi.fn(() => {
      return historyEngine;
    }),
    useLocks: vi.fn(() => {
      return lockEngine;
    }),
    usePointer: vi.fn(() => {
      return pointerEngine;
    }),
    usePresence: vi.fn(() => {
      return presenceEngine;
    }),
    useRecording: vi.fn(() => {
      return recordingEngine;
    }),
    useState: vi.fn(() => {
      return stateEngine;
    }),
    useViewport: vi.fn(() => {
      return viewportEngine;
    }),
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function runMountLifecycle(): Promise<void> {
  for (const callback of lifecycleState.mountCallbacks) {
    callback();
  }

  await flushMicrotasks();
}

async function runDestroyLifecycle(): Promise<void> {
  for (const callback of lifecycleState.destroyCallbacks) {
    callback();
  }

  await flushMicrotasks();
}

function resetLifecycleState(): void {
  lifecycleState.destroyCallbacks = [];
  lifecycleState.failRegistration = false;
  lifecycleState.mountCallbacks = [];
}

beforeEach(() => {
  createRoomMock.mockReset();
  document.body.innerHTML = '';
  resetLifecycleState();
});

describe('roomful', () => {
  it('creates the room immediately, defers connect until mount, and auto-cleans on destroy', async () => {
    const self = createPeer('svelte-self', { name: 'Ada' });
    const other = createPeer('svelte-other', { name: 'Grace' });
    const presenceEngine = createMockPresenceEngine('svelte-self', [self, other]);
    const cursorEngine = createMockCursorEngine([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    const awarenessEngine = createMockAwarenessEngine([
      createAwareness('svelte-self', {
        typing: true,
      }),
      createAwareness('svelte-other', {
        focus: 'editor-1',
      }),
    ]);
    const eventEngine = createMockEventEngine();
    const room = createMockRoom(
      'svelte-room',
      {
        transport: 'broadcast',
      },
      {
        awarenessEngine,
        cursorEngine,
        eventEngine,
        peerId: 'svelte-self',
        presenceEngine,
      },
    );

    const adapter = roomful('svelte-room', {
      transport: 'broadcast',
    });
    const snapshots: PresenceStoreValue<PresenceData>[] = [];
    const channelValues: Array<EventChannelValue<{ text: string }, PresenceData> | null> = [];
    const unsubscribePresence = adapter.presence.subscribe((value) => {
      snapshots.push(value);
    });
    const unsubscribeEvent = adapter.events.on<{ text: string }>('message', () => {
      return undefined;
    });
    const channel = adapter.events.channel<{ text: string }>('message');
    const unsubscribeChannel = channel.subscribe((value) => {
      channelValues.push(value);
    });

    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(get(adapter.presence).others).toEqual([other]);
    expect(get(adapter.cursors)).toEqual([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    expect(get(adapter.awareness)).toEqual({
      others: [
        createAwareness('svelte-other', {
          focus: 'editor-1',
        }),
      ],
    });
    expect(channelValues).toEqual([null]);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(presenceEngine.subscribe).toHaveBeenCalledTimes(0);
    expect(cursorEngine.subscribe).toHaveBeenCalledTimes(0);
    expect(awarenessEngine.subscribe).toHaveBeenCalledTimes(0);
    expect(eventEngine.on).toHaveBeenCalledTimes(0);
    expect(lifecycleState.mountCallbacks).toHaveLength(1);
    expect(lifecycleState.destroyCallbacks).toHaveLength(1);

    await runDestroyLifecycle();
    expect(room.disconnect).toHaveBeenCalledTimes(0);

    await runMountLifecycle();
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(presenceEngine.subscribe).toHaveBeenCalledTimes(1);
    expect(cursorEngine.subscribe).toHaveBeenCalledTimes(1);
    expect(awarenessEngine.subscribe).toHaveBeenCalledTimes(1);
    expect(eventEngine.on).toHaveBeenCalledTimes(2);
    expect(eventEngine.subscriberCount('message')).toBe(2);
    expect(snapshots).toHaveLength(1);

    await runDestroyLifecycle();
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(presenceEngine.subscriberCount()).toBe(0);
    expect(cursorEngine.subscriberCount()).toBe(0);
    expect(awarenessEngine.subscriberCount()).toBe(0);
    expect(eventEngine.subscriberCount('message')).toBe(0);

    unsubscribeChannel();
    unsubscribeEvent();
    unsubscribePresence();
  });

  it('supports manual connect and destroy when lifecycle hooks are unavailable', async () => {
    lifecycleState.failRegistration = true;

    const eventEngine = createMockEventEngine();
    const room = createMockRoom(
      'manual-room',
      {
        transport: 'broadcast',
      },
      {
        eventEngine,
      },
    );

    const adapter = roomful('manual-room', {
      transport: 'broadcast',
    });
    const onMessage = vi.fn();

    adapter.events.on<{ text: string }>('message', onMessage);

    expect(lifecycleState.mountCallbacks).toHaveLength(0);
    expect(lifecycleState.destroyCallbacks).toHaveLength(0);
    expect(room.connect).toHaveBeenCalledTimes(0);
    expect(eventEngine.on).toHaveBeenCalledTimes(0);

    await adapter.connect();
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(eventEngine.on).toHaveBeenCalledTimes(1);

    eventEngine.deliver('message', {
      text: 'manual',
    });
    expect(onMessage).toHaveBeenCalledWith(
      {
        text: 'manual',
      },
      expect.objectContaining({
        id: 'event-source',
      }),
    );

    await adapter.destroy();
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(eventEngine.subscriberCount('message')).toBe(0);

    await expect(adapter.connect()).rejects.toThrow('Cannot call connect() after destroy().');
  });

  it('exposes presence as a store, updates local self, and skips lastSeen-only churn', async () => {
    const self = createPeer('presence-self', { name: 'Ada' });
    const other = createPeer('presence-other', {
      metadata: {
        role: 'editor',
      },
      name: 'Grace',
    });
    const presenceEngine = createMockPresenceEngine('presence-self', [self, other]);
    createMockRoom(
      'presence-room',
      {},
      {
        peerId: 'presence-self',
        presenceEngine,
      },
    );

    const adapter = roomful('presence-room');
    const snapshots: PresenceStoreValue<PresenceData>[] = [];
    const unsubscribe = adapter.presence.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.presence).others).toEqual([other]);

    adapter.presence.set({
      status: 'online',
    });
    expect(presenceEngine.replace).toHaveBeenCalledWith({
      status: 'online',
    });
    expect(get(adapter.presence).self).toMatchObject({
      status: 'online',
    });

    adapter.presence.update((current) => {
      return {
        ...current,
        mood: 'focused',
      };
    });
    expect(presenceEngine.replace).toHaveBeenLastCalledWith({
      mood: 'focused',
      status: 'online',
    });

    await adapter.connect();
    const snapshotCountAfterConnect = snapshots.length;

    presenceEngine.emit([
      {
        id: 'presence-self',
        joinedAt: 1,
        lastSeen: 2,
        mood: 'focused',
        status: 'online',
      },
      createPeer('presence-other', {
        lastSeen: 99,
        metadata: {
          role: 'editor',
        },
        name: 'Grace',
      }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountAfterConnect);

    presenceEngine.emit([
      {
        id: 'presence-self',
        joinedAt: 1,
        lastSeen: 1,
        mood: 'focused',
        status: 'online',
      },
      createPeer('presence-other', {
        metadata: {
          role: 'reviewer',
        },
        name: 'Grace',
      }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountAfterConnect + 1);
    expect(snapshots[snapshotCountAfterConnect]?.others[0]).toMatchObject({
      metadata: {
        role: 'reviewer',
      },
    });

    unsubscribe();
  });

  it('exposes awareness as a store, forwards helper methods, and only reacts to remote changes', async () => {
    const awarenessEngine = createMockAwarenessEngine([
      createAwareness('awareness-self', {
        typing: true,
      }),
      createAwareness('awareness-other', {
        focus: 'editor-1',
      }),
    ]);
    createMockRoom(
      'awareness-room',
      {},
      {
        awarenessEngine,
        peerId: 'awareness-self',
      },
    );

    const adapter = roomful('awareness-room');
    const snapshots: AwarenessStoreValue[] = [];
    const unsubscribe = adapter.awareness.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.awareness)).toEqual({
      others: [
        createAwareness('awareness-other', {
          focus: 'editor-1',
        }),
      ],
    });

    adapter.awareness.set({
      mode: 'draft',
    });
    adapter.awareness.setFocus('comment-1');
    adapter.awareness.setSelection({
      elementId: 'comment-1',
      from: 1,
      to: 3,
    });
    adapter.awareness.setTyping(false);

    expect(awarenessEngine.set).toHaveBeenCalledWith({
      mode: 'draft',
    });
    expect(awarenessEngine.setFocus).toHaveBeenCalledWith('comment-1');
    expect(awarenessEngine.setSelection).toHaveBeenCalledWith({
      elementId: 'comment-1',
      from: 1,
      to: 3,
    });
    expect(awarenessEngine.setTyping).toHaveBeenCalledWith(false);

    await adapter.connect();

    awarenessEngine.emit([
      createAwareness('awareness-self', {
        mode: 'review',
      }),
      createAwareness('awareness-other', {
        focus: 'editor-1',
      }),
    ]);
    expect(snapshots).toHaveLength(1);

    awarenessEngine.emit([
      createAwareness('awareness-self', {
        mode: 'review',
      }),
      createAwareness('awareness-other', {
        focus: 'editor-2',
      }),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toEqual({
      others: [
        createAwareness('awareness-other', {
          focus: 'editor-2',
        }),
      ],
    });

    unsubscribe();
  });

  it('mounts cursor actions on elements, supports rebinding, and skips deep-equal remote updates', async () => {
    const cursorEngine = createMockCursorEngine([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    createMockRoom(
      'cursor-room',
      {},
      {
        cursorEngine,
      },
    );

    const adapter = roomful('cursor-room');
    const snapshots: Array<CursorPosition<CursorData>[]> = [];
    const unsubscribe = adapter.cursors.subscribe((value) => {
      snapshots.push(value);
    });
    const boardA = document.createElement('div');
    const boardB = document.createElement('div');

    const cleanupA = adapter.cursors.mount(boardA);
    expect(cursorEngine.mount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(boardA);

    const cleanupB = adapter.cursors.mount(boardB);
    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenCalledTimes(2);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(boardB);

    cleanupA.destroy?.();
    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);

    cleanupB.destroy?.();
    expect(cursorEngine.unmount).toHaveBeenCalledTimes(2);

    adapter.cursors.set({
      x: 0.5,
      y: 0.25,
    });
    adapter.cursors.update((current) => {
      return {
        ...current,
        tool: 'eraser',
      };
    });
    expect(cursorEngine.setPosition).toHaveBeenNthCalledWith(1, {
      x: 0.5,
      y: 0.25,
    });
    expect(cursorEngine.setPosition).toHaveBeenNthCalledWith(2, {
      tool: 'eraser',
      x: 0.5,
      y: 0.25,
    });

    await adapter.connect();

    cursorEngine.emit([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    expect(snapshots).toHaveLength(1);

    cursorEngine.emit([
      createCursor('cursor-peer', {
        tool: 'eraser',
        x: 0.8,
        xAbsolute: 80,
      }),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      tool: 'eraser',
      x: 0.8,
      xAbsolute: 80,
    });

    unsubscribe();
  });

  it('exposes viewport as a store, mounts actions, forwards controls, and skips deep-equal updates', async () => {
    const viewportEngine = createMockViewportEngine([
      createViewport('viewport-peer', {
        scrollY: 0.5,
      }),
    ]);
    createMockRoom(
      'viewport-room',
      {},
      {
        viewportEngine,
      },
    );

    const adapter = roomful('viewport-room');
    const snapshots: Array<ViewportState[]> = [];
    const unsubscribe = adapter.viewport.subscribe((value) => {
      snapshots.push(value);
    });
    const boardA = document.createElement('div');
    const boardB = document.createElement('div');

    expect(get(adapter.viewport)).toEqual([
      createViewport('viewport-peer', {
        scrollY: 0.5,
      }),
    ]);

    const cleanupA = adapter.viewport.mount(boardA);
    expect(viewportEngine.mount).toHaveBeenCalledTimes(1);
    expect(viewportEngine.mount).toHaveBeenLastCalledWith(boardA);

    const cleanupB = adapter.viewport.mount(boardB);
    expect(viewportEngine.unmount).toHaveBeenCalledTimes(1);
    expect(viewportEngine.mount).toHaveBeenCalledTimes(2);
    expect(viewportEngine.mount).toHaveBeenLastCalledWith(boardB);

    cleanupA.destroy?.();
    expect(viewportEngine.unmount).toHaveBeenCalledTimes(1);

    cleanupB.destroy?.();
    expect(viewportEngine.unmount).toHaveBeenCalledTimes(2);

    adapter.viewport.broadcast();
    adapter.viewport.stopBroadcast();
    adapter.viewport.present();
    adapter.viewport.stopPresenting();
    adapter.viewport.follow('viewport-peer');
    adapter.viewport.unfollow();

    expect(viewportEngine.broadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopBroadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.present).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopPresenting).toHaveBeenCalledTimes(1);
    expect(viewportEngine.follow).toHaveBeenCalledWith('viewport-peer');
    expect(viewportEngine.unfollow).toHaveBeenCalledTimes(1);

    await adapter.connect();

    viewportEngine.emit([
      createViewport('viewport-peer', {
        scrollY: 0.5,
      }),
    ]);
    expect(snapshots).toHaveLength(1);

    viewportEngine.emit([
      createViewport('viewport-peer', {
        scrollY: 0.9,
      }),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      scrollY: 0.9,
    });

    unsubscribe();
  });

  it('exposes pointer as a store, mounts actions, forwards controls, and skips deep-equal updates', async () => {
    const pointerEngine = createMockPointerEngine([
      createBeam('pointer-peer', {
        x: 0.4,
        y: 0.6,
      }),
    ]);
    createMockRoom(
      'pointer-room',
      {},
      {
        pointerEngine,
      },
    );

    const adapter = roomful('pointer-room');
    const snapshots: Array<PointerBeam[]> = [];
    const unsubscribe = adapter.pointer.subscribe((value) => {
      snapshots.push(value);
    });
    const boardA = document.createElement('div');
    const boardB = document.createElement('div');

    expect(get(adapter.pointer)).toEqual([
      createBeam('pointer-peer', {
        x: 0.4,
        y: 0.6,
      }),
    ]);

    const cleanupA = adapter.pointer.mount(boardA);
    expect(pointerEngine.mount).toHaveBeenCalledTimes(1);
    expect(pointerEngine.mount).toHaveBeenLastCalledWith(boardA);

    const cleanupB = adapter.pointer.mount(boardB);
    expect(pointerEngine.unmount).toHaveBeenCalledTimes(1);
    expect(pointerEngine.mount).toHaveBeenCalledTimes(2);
    expect(pointerEngine.mount).toHaveBeenLastCalledWith(boardB);

    cleanupA.destroy?.();
    expect(pointerEngine.unmount).toHaveBeenCalledTimes(1);

    cleanupB.destroy?.();
    expect(pointerEngine.unmount).toHaveBeenCalledTimes(2);

    adapter.pointer.activate();
    adapter.pointer.deactivate();
    const cleanup = adapter.pointer.render({ style: 'laser' });

    expect(pointerEngine.activate).toHaveBeenCalledTimes(1);
    expect(pointerEngine.deactivate).toHaveBeenCalledTimes(1);
    expect(pointerEngine.render).toHaveBeenCalledWith({ style: 'laser' });
    expect(typeof cleanup).toBe('function');

    await adapter.connect();

    pointerEngine.emit([
      createBeam('pointer-peer', {
        x: 0.4,
        y: 0.6,
      }),
    ]);
    expect(snapshots).toHaveLength(1);

    pointerEngine.emit([
      createBeam('pointer-peer', {
        x: 0.9,
      }),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      x: 0.9,
    });

    unsubscribe();
  });

  it('exposes locks as a store, reflects remote claims, and forwards controls', async () => {
    const lockEngine = createMockLockEngine();
    lockEngine.setHolder('cell-1', createPeer('owner-peer'));
    createMockRoom(
      'locks-room',
      {},
      {
        lockEngine,
      },
    );

    const adapter = roomful('locks-room');
    const snapshots: Array<LockState[]> = [];
    const unsubscribe = adapter.locks.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.locks)).toEqual([expect.objectContaining({ key: 'cell-1' })]);
    expect(adapter.locks.isLocked('cell-1')).toBe(true);
    expect(adapter.locks.getHolder('cell-1')?.id).toBe('owner-peer');

    await adapter.locks.acquire('cell-2', { ttl: 1_000 });
    adapter.locks.release('cell-1');
    adapter.locks.releaseAll();

    expect(lockEngine.acquire).toHaveBeenCalledWith('cell-2', { ttl: 1_000 });
    expect(lockEngine.release).toHaveBeenCalledWith('cell-1');
    expect(lockEngine.releaseAll).toHaveBeenCalledTimes(1);

    await adapter.connect();

    // A remote claim on a new key is reflected in the store; a deep-equal re-emit is skipped.
    lockEngine.emitAll([
      createLock('cell-1', createPeer('owner-peer')),
      createLock('cell-3', createPeer('peer-c')),
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.map((state) => state.key)).toEqual(['cell-1', 'cell-3']);
    expect(adapter.locks.getHolder('cell-3')?.id).toBe('peer-c');

    lockEngine.emitAll([
      createLock('cell-1', createPeer('owner-peer')),
      createLock('cell-3', createPeer('peer-c')),
    ]);
    expect(snapshots).toHaveLength(2);

    unsubscribe();
  });

  it('exposes comments as a store, reflects remote threads, and forwards controls', async () => {
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

    const adapter = roomful('comments-room');
    const snapshots: Array<CommentThread[]> = [];
    const unsubscribe = adapter.comments.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.comments)).toEqual([expect.objectContaining({ id: 'seed' })]);
    expect(snapshots).toHaveLength(1);

    await adapter.connect();

    // Adding a thread is reflected in the store.
    await adapter.comments.add({ anchor: { elementId: 'cell-1' }, text: 'New thread' });
    expect(commentsEngine.add).toHaveBeenCalledWith({
      anchor: { elementId: 'cell-1' },
      text: 'New thread',
    });
    expect(get(adapter.comments).map((thread) => thread.id)).toEqual(['seed', 'thread-2']);

    await adapter.comments.reply('seed', 'A reply');
    await adapter.comments.resolve('seed');
    await adapter.comments.reopen('seed');

    expect(commentsEngine.reply).toHaveBeenCalledWith('seed', 'A reply');
    expect(commentsEngine.resolve).toHaveBeenCalledWith('seed');
    expect(commentsEngine.reopen).toHaveBeenCalledWith('seed');

    // A remote thread is reflected in the store; a deep-equal re-emit is skipped.
    const snapshotCountBeforeEmit = snapshots.length;
    commentsEngine.emit([
      createCommentThread('seed', { text: 'Seed thread' }),
      createCommentThread('remote', { text: 'Remote thread' }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountBeforeEmit + 1);
    expect(snapshots.at(-1)?.map((thread) => thread.id)).toEqual(['seed', 'remote']);
    expect(adapter.comments.getOpen()).toHaveLength(2);

    commentsEngine.emit([
      createCommentThread('seed', { text: 'Seed thread' }),
      createCommentThread('remote', { text: 'Remote thread' }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountBeforeEmit + 1);

    unsubscribe();

    await adapter.destroy();
    expect(commentsEngine.subscriberCount()).toBe(0);
  });

  it('forwards comments storage options to room.useComments', () => {
    const commentsEngine = createMockCommentsEngine();
    const room = createMockRoom(
      'comments-options-room',
      {},
      {
        commentsEngine,
      },
    );

    roomful('comments-options-room', { comments: { storage: 'indexeddb' } });

    expect(room.useComments.mock.calls[0]?.[0]).toEqual({ storage: 'indexeddb' });
  });

  it('exposes activity as a store, reflects remote entries, and forwards record', async () => {
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

    const adapter = roomful('activity-room');
    const snapshots: Array<ActivityEntry[]> = [];
    const unsubscribe = adapter.activity.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.activity)).toEqual([expect.objectContaining({ id: 'seed' })]);
    expect(snapshots).toHaveLength(1);

    await adapter.connect();

    // Recording an entry is reflected newest-first in the store.
    adapter.activity.record('comment:added', { n: 1 });
    expect(activityEngine.record).toHaveBeenCalledWith('comment:added', { n: 1 });
    expect(get(adapter.activity)[0]).toEqual(expect.objectContaining({ type: 'comment:added' }));

    // A remote entry is reflected in the store; a deep-equal re-emit is skipped.
    const snapshotCountBeforeEmit = snapshots.length;
    activityEngine.emit([
      createActivityEntry('remote', { type: 'record:locked', timestamp: 9 }),
      createActivityEntry('seed', { type: 'seed' }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountBeforeEmit + 1);
    expect(snapshots.at(-1)?.map((entry) => entry.id)).toEqual(['remote', 'seed']);

    activityEngine.emit([
      createActivityEntry('remote', { type: 'record:locked', timestamp: 9 }),
      createActivityEntry('seed', { type: 'seed' }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountBeforeEmit + 1);

    unsubscribe();

    await adapter.destroy();
    expect(activityEngine.subscriberCount()).toBe(0);
  });

  it('forwards activity options to room.useActivity', () => {
    const activityEngine = createMockActivityEngine();
    const room = createMockRoom(
      'activity-options-room',
      {},
      {
        activityEngine,
      },
    );

    roomful('activity-options-room', { activity: { limit: 50 } });

    expect(room.useActivity.mock.calls[0]?.[0]).toEqual({ limit: 50 });
  });

  it('exposes field presence as a store, reflects remote changes, and forwards setActiveField', async () => {
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

    const adapter = roomful('field-room');
    const snapshots: Array<FieldPresenceState[]> = [];
    const unsubscribe = adapter.fieldPresence.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.fieldPresence)).toEqual([expect.objectContaining({ fieldId: 'email' })]);
    expect(adapter.fieldPresence.getFieldPeers('email').map((peer) => peer.id)).toEqual(['peer-a']);
    expect(snapshots).toHaveLength(1);

    await adapter.connect();

    adapter.fieldPresence.setActiveField('name');
    expect(fieldPresenceEngine.setActiveField).toHaveBeenCalledWith('name');

    // A remote change is reflected in the store; a deep-equal re-emit is skipped.
    const snapshotCountBeforeEmit = snapshots.length;
    fieldPresenceEngine.emit([
      createFieldPresenceState('email', ['peer-a']),
      createFieldPresenceState('name', ['peer-b']),
    ]);
    expect(snapshots).toHaveLength(snapshotCountBeforeEmit + 1);
    expect(snapshots.at(-1)?.map((field) => field.fieldId)).toEqual(['email', 'name']);

    fieldPresenceEngine.emit([
      createFieldPresenceState('email', ['peer-a']),
      createFieldPresenceState('name', ['peer-b']),
    ]);
    expect(snapshots).toHaveLength(snapshotCountBeforeEmit + 1);

    unsubscribe();

    await adapter.destroy();
    expect(fieldPresenceEngine.subscriberCount()).toBe(0);
  });

  it('exposes history as a store, reflects captures and remote entries, and forwards controls', async () => {
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

    const adapter = roomful('history-room');
    const snapshots: Array<TimelineEntry[]> = [];
    const unsubscribe = adapter.history.subscribe((value) => {
      snapshots.push(value);
    });

    expect(get(adapter.history)).toEqual([expect.objectContaining({ id: 'seed' })]);
    expect(get(adapter.history.canUndo)).toBe(false);
    expect(get(adapter.history.canRedo)).toBe(false);
    expect(snapshots).toHaveLength(1);

    await adapter.connect();

    // capture appends a timeline entry reactively.
    adapter.history.capture('move', 'Moved a shape');
    expect(historyEngine.capture).toHaveBeenCalledWith('move', 'Moved a shape');
    expect(get(adapter.history).map((entry) => entry.id)).toEqual(['seed', 'entry-2']);

    // transaction wraps a mutation and flips canUndo.
    const wrapped = vi.fn();
    adapter.history.transaction('add-shape', wrapped);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(historyEngine.transaction).toHaveBeenCalledWith('add-shape', wrapped);
    expect(get(adapter.history.canUndo)).toBe(true);

    await adapter.history.undo();
    expect(historyEngine.undo).toHaveBeenCalledTimes(1);
    expect(get(adapter.history.canUndo)).toBe(false);
    expect(get(adapter.history.canRedo)).toBe(true);

    await adapter.history.redo();
    expect(historyEngine.redo).toHaveBeenCalledTimes(1);
    expect(get(adapter.history.canUndo)).toBe(true);

    // A remote timeline change is reflected in the store; a deep-equal re-emit is skipped.
    const snapshotCountBeforeEmit = snapshots.length;
    historyEngine.emit([
      createTimelineEntry('seed', { action: 'draw' }),
      createTimelineEntry('remote', { action: 'erase' }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountBeforeEmit + 1);
    expect(snapshots.at(-1)?.map((entry) => entry.id)).toEqual(['seed', 'remote']);

    historyEngine.emit([
      createTimelineEntry('seed', { action: 'draw' }),
      createTimelineEntry('remote', { action: 'erase' }),
    ]);
    expect(snapshots).toHaveLength(snapshotCountBeforeEmit + 1);

    unsubscribe();

    await adapter.destroy();
    expect(historyEngine.subscriberCount()).toBe(0);
  });

  it('forwards history options to room.useHistory', () => {
    const historyEngine = createMockHistoryEngine();
    const room = createMockRoom(
      'history-options-room',
      {},
      {
        historyEngine,
      },
    );

    roomful('history-options-room', { history: { maxEntries: 50 } });

    expect(room.useHistory.mock.calls[0]?.[0]).toEqual({ maxEntries: 50 });
  });

  it('exposes recording as reactive stores and forwards controls', async () => {
    const recordingEngine = createMockRecordingEngine(
      createRecordingState({ durationMs: 0, frameCount: 0, isRecording: false }),
    );
    createMockRoom(
      'recording-room',
      {},
      {
        recordingEngine,
      },
    );

    const adapter = roomful('recording-room');
    const isRecordingValues: boolean[] = [];
    const frameCountValues: number[] = [];
    const durationValues: number[] = [];
    const unsubscribeIsRecording = adapter.recording.isRecording.subscribe((value) => {
      isRecordingValues.push(value);
    });
    const unsubscribeFrameCount = adapter.recording.frameCount.subscribe((value) => {
      frameCountValues.push(value);
    });
    const unsubscribeDuration = adapter.recording.durationMs.subscribe((value) => {
      durationValues.push(value);
    });

    expect(get(adapter.recording.isRecording)).toBe(false);
    expect(get(adapter.recording.frameCount)).toBe(0);
    expect(get(adapter.recording.durationMs)).toBe(0);

    await adapter.connect();
    expect(recordingEngine.subscribe).toHaveBeenCalledTimes(1);

    // A recorder state change is reflected across all three stores.
    recordingEngine.emit(
      createRecordingState({ durationMs: 1_200, frameCount: 3, isRecording: true }),
    );
    expect(get(adapter.recording.isRecording)).toBe(true);
    expect(get(adapter.recording.frameCount)).toBe(3);
    expect(get(adapter.recording.durationMs)).toBe(1_200);
    expect(isRecordingValues.at(-1)).toBe(true);
    expect(frameCountValues.at(-1)).toBe(3);
    expect(durationValues.at(-1)).toBe(1_200);

    // Controls forward to the engine.
    adapter.recording.start();
    expect(recordingEngine.start).toHaveBeenCalledTimes(1);

    adapter.recording.stop();
    expect(recordingEngine.stop).toHaveBeenCalledTimes(1);

    const exported = adapter.recording.exportRecording();
    expect(recordingEngine.export).toHaveBeenCalledTimes(1);
    expect(exported).toMatchObject({ durationMs: 1_200, version: 1 });

    const session = adapter.recording.replay();
    expect(recordingEngine.replay).toHaveBeenCalledTimes(1);
    expect(typeof session.play).toBe('function');

    unsubscribeIsRecording();
    unsubscribeFrameCount();
    unsubscribeDuration();

    await adapter.destroy();
    expect(recordingEngine.subscriberCount()).toBe(0);
  });

  it('creates per-key lockState stores that track free to held to free transitions', async () => {
    const lockEngine = createMockLockEngine();
    createMockRoom(
      'lock-state-room',
      {},
      {
        lockEngine,
      },
    );

    const adapter = roomful('lock-state-room');
    const store = adapter.lockState('cell-1');
    const sameStore = adapter.lockState('cell-1');
    const observed: Array<LockState | null> = [];
    const unsubscribe = store.subscribe((value) => {
      observed.push(value);
    });

    // Initially free.
    expect(get(store)).toBeNull();
    expect(observed.at(-1)).toBeNull();

    await adapter.connect();

    lockEngine.emitKey('cell-1', createLock('cell-1', createPeer('owner-peer')));
    expect(observed.at(-1)).toMatchObject({ key: 'cell-1', holder: { id: 'owner-peer' } });

    lockEngine.emitKey('cell-1', createLock('cell-1', null));
    expect(observed.at(-1)).toBeNull();

    // A second store for the same key reuses the same subscription.
    expect(lockEngine.keySubscriberCount('cell-1')).toBe(1);
    expect(get(sameStore)).toBeNull();

    unsubscribe();

    await adapter.destroy();
    expect(lockEngine.keySubscriberCount('cell-1')).toBe(0);
  });

  it('creates shared state stores, keeps setter identity stable, and enforces binding rules', async () => {
    const stateEngine = createMockStateEngine({
      count: 0,
    });
    const room = createMockRoom(
      'state-room',
      {},
      {
        stateEngine,
      },
    );

    const adapter = roomful('state-room');
    const [countStore, setCount] = adapter.state.shared('counter', {
      initialValue: {
        count: 0,
      },
    });
    const [sameStore, sameSetter] = adapter.state.shared('counter', {
      initialValue: {
        count: 0,
      },
    });
    const values: Array<{ count: number }> = [];
    const unsubscribe = countStore.subscribe((value) => {
      values.push(value);
    });

    expect(countStore).toBe(sameStore);
    expect(setCount).toBe(sameSetter);
    expect(get(countStore)).toEqual({
      count: 0,
    });
    expect(stateEngine.subscribe).toHaveBeenCalledTimes(0);

    countStore.set({
      count: 1,
    });
    countStore.update((current) => {
      return {
        count: current.count + 1,
      };
    });
    setCount((current) => {
      return {
        count: current.count + 1,
      };
    });

    expect(values).toEqual([{ count: 0 }, { count: 1 }, { count: 2 }, { count: 3 }]);
    expect(stateEngine.set).toHaveBeenNthCalledWith(1, {
      count: 1,
    });
    expect(stateEngine.set).toHaveBeenNthCalledWith(2, {
      count: 2,
    });
    expect(stateEngine.set).toHaveBeenNthCalledWith(3, {
      count: 3,
    });

    await adapter.connect();
    expect(stateEngine.subscribe).toHaveBeenCalledTimes(1);

    stateEngine.emit({
      count: 3,
    });
    expect(values).toHaveLength(4);

    stateEngine.emit({
      count: 4,
    });
    expect(values).toHaveLength(5);
    expect(values[4]).toEqual({
      count: 4,
    });

    adapter.state.shared('counter', {
      initialValue: {
        count: 0,
      },
      persist: true,
    });
    expect(room.useState.mock.calls).toHaveLength(2);

    expect(() => {
      adapter.state.shared('different-key', {
        initialValue: {
          count: 0,
        },
      });
    }).toThrow('already bound to key');
    expect(() => {
      adapter.state.shared('counter', {
        initialValue: {
          count: 1,
        },
      });
    }).toThrow('different initialValue');

    unsubscribe();
  });

  it('registers event listeners lazily, exposes per-event channels, and cleans them up on destroy', async () => {
    const eventEngine = createMockEventEngine();
    createMockRoom(
      'event-room',
      {},
      {
        eventEngine,
      },
    );

    const adapter = roomful('event-room');
    const onMessage = vi.fn();
    const unsubscribe = adapter.events.on<{ text: string }>('message', onMessage);
    const channel = adapter.events.channel<{ text: string }>('message');
    const values: Array<EventChannelValue<{ text: string }, PresenceData> | null> = [];
    const unsubscribeChannel = channel.subscribe((value) => {
      values.push(value);
    });

    expect(values).toEqual([null]);
    expect(eventEngine.on).toHaveBeenCalledTimes(0);

    await adapter.connect();
    expect(eventEngine.on).toHaveBeenCalledTimes(2);
    expect(eventEngine.subscriberCount('message')).toBe(2);

    eventEngine.deliver(
      'message',
      {
        text: 'hello',
      },
      createPeer('sender-a', {
        name: 'Sender A',
      }),
    );

    expect(onMessage).toHaveBeenCalledWith(
      {
        text: 'hello',
      },
      expect.objectContaining({
        id: 'sender-a',
        name: 'Sender A',
      }),
    );
    expect(values[1]).toEqual({
      from: createPeer('sender-a', {
        name: 'Sender A',
      }),
      payload: {
        text: 'hello',
      },
    });

    channel.emit({
      text: 'outbound',
    });
    channel.emitTo('peer-b', {
      text: 'direct',
    });

    expect(eventEngine.emit).toHaveBeenCalledWith('message', {
      text: 'outbound',
    });
    expect(eventEngine.emitTo).toHaveBeenCalledWith('peer-b', 'message', {
      text: 'direct',
    });

    unsubscribe();
    expect(eventEngine.subscriberCount('message')).toBe(1);

    unsubscribeChannel();
    await adapter.destroy();
    expect(eventEngine.subscriberCount('message')).toBe(0);
  });

  it('preserves the intended public types', () => {
    createMockRoom('typed-room', {}, { peerId: 'typed-self' });

    const adapter = roomful<{ role: 'editor' | 'viewer' }, { tool: 'pen' | 'eraser' }>(
      'typed-room',
    );
    const [votes, setVotes] = adapter.state.shared('votes', {
      initialValue: {
        no: 0,
        yes: 0,
      },
    });
    const reaction = adapter.events.channel<{ emoji: string }>('reaction');

    expectTypeOf(get(adapter.presence).others[0]?.role).toEqualTypeOf<
      'editor' | 'viewer' | undefined
    >();
    expectTypeOf(get(adapter.cursors)[0]?.tool).toEqualTypeOf<'pen' | 'eraser' | undefined>();
    expectTypeOf(votes).toMatchTypeOf<Writable<{ no: number; yes: number }>>();
    expectTypeOf(setVotes).toEqualTypeOf<
      (
        nextValue:
          | { no: number; yes: number }
          | ((current: { no: number; yes: number }) => { no: number; yes: number }),
      ) => void
    >();
    expectTypeOf(get(reaction)?.payload.emoji).toEqualTypeOf<string | undefined>();
    expectTypeOf(adapter.cursors.mount).toEqualTypeOf<Action<HTMLElement, undefined>>();
  });

  it('throws typed errors for destroyed adapters', async () => {
    createMockRoom('destroyed-room');
    const adapter = roomful('destroyed-room');

    await adapter.destroy();

    expect(() => {
      adapter.events.emit('message', {
        text: 'boom',
      });
    }).toThrowError(RoomfulError);
    expect(() => {
      adapter.presence.set({
        status: 'away',
      });
    }).toThrow('destroy()');
  });

  it('exposes a status store that tracks room lifecycle transitions', async () => {
    const room = createMockRoom('status-room');
    const adapter = roomful('status-room');
    const statuses: RoomStatus[] = [];
    const unsubscribe = adapter.status.subscribe((value) => {
      statuses.push(value);
    });

    room.emit('connected', undefined);
    room.emit('reconnecting', { attempt: 1 });
    room.emit('disconnected', { reason: 'manual' });
    room.emit('error', new RoomfulError('NETWORK_ERROR', 'boom', true));

    expect(statuses).toEqual(['idle', 'connected', 'reconnecting', 'disconnected', 'error']);

    unsubscribe();
    await adapter.destroy();
  });

  it('forwards connected, disconnected, and error events to lifecycle callbacks and cleans up', async () => {
    const room = createMockRoom('lifecycle-room');
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onError = vi.fn();
    const adapter = roomful('lifecycle-room', {
      onConnect,
      onDisconnect,
      onError,
    });

    const error = new RoomfulError('NETWORK_ERROR', 'boom', true);
    room.emit('connected', undefined);
    room.emit('disconnected', { reason: 'manual' });
    room.emit('error', error);

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith({ reason: 'manual' });
    expect(onError).toHaveBeenCalledWith(error);

    await adapter.destroy();

    expect(room.listenerCount('connected')).toBe(0);
    expect(room.listenerCount('disconnected')).toBe(0);
    expect(room.listenerCount('error')).toBe(0);
  });
});
