// @vitest-environment jsdom

import type {
  ActivityEngine,
  ActivityEntry,
  AgentApprovalEngine,
  AgentProposal,
  AwarenessEngine,
  AwarenessState,
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
  Room,
  RoomEventMap,
  RoomEventName,
  RoomOptions,
  RoomStatus,
  StateChangeMeta,
  StateEngine,
  TimelineEntry,
  ViewportEngine,
  ViewportState,
} from '@roomful/core';
import { RoomfulError } from '@roomful/core';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

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

import type {
  UseActivityResult,
  UseAgentApprovalsResult,
  UseAwarenessResult,
  UseCommentsResult,
  UseCursorsResult,
  UseFieldPresenceResult,
  UseHistoryResult,
  UseLocksResult,
  UsePointerResult,
  UsePresenceResult,
  UseViewportResult,
} from './index';
import {
  RoomfulProvider,
  useActivity,
  useAgentApprovals,
  useAwareness,
  useComments,
  useConnectionStatus,
  useCursors,
  useEvent,
  useFieldPresence,
  useHistory,
  useLocks,
  useLockState,
  usePeers,
  usePointer,
  usePresence,
  useRoom,
  useSessionSummarizer,
  useSharedState,
  useViewport,
} from './index';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

type RoomEventPayload = RoomEventMap<PresenceData>[RoomEventName];
type RoomEventHandler = (payload: RoomEventPayload) => void;
type AwarenessSubscriber = (peers: AwarenessState[]) => void;
type CursorSubscriber = (positions: CursorPosition<CursorData>[]) => void;
type EventSubscriber = (payload: unknown, from: Peer<PresenceData>) => void;
type PresenceSubscriber = (peers: Peer<PresenceData>[]) => void;
type StateSubscriber<T> = (value: T, meta: StateChangeMeta) => void;
type ViewportSubscriber = (states: ViewportState[]) => void;
type PointerSubscriber = (beams: PointerBeam[]) => void;
type HistorySubscriber = (timeline: TimelineEntry[]) => void;

interface RenderHarness {
  rerender(element: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

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
  getAll: ReturnType<typeof vi.fn<() => ViewportState[]>>;
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
  getAll: ReturnType<typeof vi.fn<() => PointerBeam[]>>;
  activate: ReturnType<typeof vi.fn<() => void>>;
  deactivate: ReturnType<typeof vi.fn<() => void>>;
  render: ReturnType<typeof vi.fn<() => () => void>>;
};

type LockStateSubscriber = (state: LockState) => void;
type LocksSubscriber = (states: LockState[]) => void;

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

type ActivitySubscriber = (entries: ActivityEntry[]) => void;

type TestActivityEngine = ActivityEngine & {
  seed(entry: ActivityEntry): void;
  record: ReturnType<typeof vi.fn<ActivityEngine['record']>>;
  subscribe: ReturnType<typeof vi.fn<(cb: ActivitySubscriber) => () => void>>;
};

type ApprovalsSubscriber = (proposals: AgentProposal[]) => void;

type TestAgentApprovalEngine = AgentApprovalEngine & {
  seed(proposal: AgentProposal): void;
  approve: ReturnType<typeof vi.fn<AgentApprovalEngine['approve']>>;
  reject: ReturnType<typeof vi.fn<AgentApprovalEngine['reject']>>;
  propose: ReturnType<typeof vi.fn<AgentApprovalEngine['propose']>>;
  subscribe: ReturnType<typeof vi.fn<(cb: ApprovalsSubscriber) => () => void>>;
};

type FieldPresenceSubscriber = (fields: FieldPresenceState[]) => void;

type TestFieldPresenceEngine = FieldPresenceEngine & {
  emit(fields: FieldPresenceState[]): void;
  setActiveField: ReturnType<typeof vi.fn<FieldPresenceEngine['setActiveField']>>;
  subscribe: ReturnType<typeof vi.fn<(cb: FieldPresenceSubscriber) => () => void>>;
};

type CommentsSubscriber = (threads: CommentThread[]) => void;

type TestCommentsEngine = CommentsEngine & {
  emit(threads: CommentThread[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: CommentsSubscriber) => () => void>>;
  add: ReturnType<
    typeof vi.fn<
      (input: { anchor: CommentThread['anchor']; text: string }) => Promise<CommentThread>
    >
  >;
  reply: ReturnType<typeof vi.fn<(threadId: string, text: string) => Promise<CommentThread>>>;
  resolve: ReturnType<typeof vi.fn<(threadId: string) => Promise<CommentThread>>>;
  reopen: ReturnType<typeof vi.fn<(threadId: string) => Promise<CommentThread>>>;
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

type TestAwarenessEngine = AwarenessEngine & {
  emit(peers: AwarenessState[]): void;
  subscriberCount(): number;
  subscribe: ReturnType<typeof vi.fn<(cb: AwarenessSubscriber) => () => void>>;
  set: ReturnType<typeof vi.fn<(value: Record<string, unknown>) => void>>;
  setFocus: ReturnType<typeof vi.fn<(elementId: string | null) => void>>;
  setSelection: ReturnType<typeof vi.fn<(selection: AwarenessState['selection'] | null) => void>>;
  setTyping: ReturnType<typeof vi.fn<(isTyping: boolean) => void>>;
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
    anchor: { elementId: 'el' },
    author: createPeer('author'),
    text: id,
    createdAt: 1,
    resolved: false,
    replies: [],
    ...overrides,
  };
}

function createTimelineEntry(id: string, overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id,
    peerId: 'author',
    peerName: 'Author',
    action: id,
    timestamp: 1,
    description: id,
    ...overrides,
  };
}

function createMockActivityEngine(): TestActivityEngine {
  const subscribers = new Set<ActivitySubscriber>();
  const entries: ActivityEntry[] = [];

  const notify = (): void => {
    for (const subscriber of subscribers) {
      subscriber(entries.map((entry) => cloneTestValue(entry)));
    }
  };

  const record = vi.fn<ActivityEngine['record']>((type, data) => {
    const entry: ActivityEntry = {
      id: `entry-${entries.length + 1}`,
      type,
      actor: createPeer('self'),
      timestamp: entries.length + 1,
      ...(data !== undefined ? { data } : {}),
    };
    entries.unshift(entry);
    notify();
    return cloneTestValue(entry);
  });

  const subscribe = vi.fn<(cb: ActivitySubscriber) => () => void>((callback) => {
    subscribers.add(callback);
    callback(entries.map((entry) => cloneTestValue(entry)));
    return () => {
      subscribers.delete(callback);
    };
  });

  return {
    seed(entry: ActivityEntry): void {
      entries.unshift(cloneTestValue(entry));
      notify();
    },
    record,
    getEntries: (): ActivityEntry[] => {
      return entries.map((entry) => cloneTestValue(entry));
    },
    subscribe,
  };
}

function createMockAgentApprovalEngine(): TestAgentApprovalEngine {
  const subscribers = new Set<ApprovalsSubscriber>();
  const proposals: AgentProposal[] = [];

  const notify = (): void => {
    for (const subscriber of subscribers) {
      subscriber(proposals.map((proposal) => cloneTestValue(proposal)));
    }
  };

  const propose = vi.fn<AgentApprovalEngine['propose']>(({ type, payload }) => {
    const proposal: AgentProposal = {
      id: `proposal-${proposals.length + 1}`,
      proposer: createPeer('self'),
      type,
      status: 'pending',
      timestamp: proposals.length + 1,
      ...(payload !== undefined ? { payload } : {}),
    };
    proposals.unshift(proposal);
    notify();
    return cloneTestValue(proposal);
  });

  const decide = (id: string, status: 'approved' | 'rejected'): void => {
    const proposal = proposals.find((entry) => entry.id === id);
    if (proposal && proposal.status === 'pending') {
      proposal.status = status;
      proposal.decidedBy = createPeer('self');
      notify();
    }
  };

  const approve = vi.fn<AgentApprovalEngine['approve']>((id) => {
    decide(id, 'approved');
  });
  const reject = vi.fn<AgentApprovalEngine['reject']>((id) => {
    decide(id, 'rejected');
  });

  const subscribe = vi.fn<(cb: ApprovalsSubscriber) => () => void>((callback) => {
    subscribers.add(callback);
    callback(proposals.map((proposal) => cloneTestValue(proposal)));
    return () => {
      subscribers.delete(callback);
    };
  });

  return {
    seed(proposal: AgentProposal): void {
      proposals.unshift(cloneTestValue(proposal));
      notify();
    },
    propose,
    approve,
    reject,
    getProposals: (): AgentProposal[] => {
      return proposals.map((proposal) => cloneTestValue(proposal));
    },
    getPending: (): AgentProposal[] => {
      return proposals
        .filter((proposal) => proposal.status === 'pending')
        .map((proposal) => cloneTestValue(proposal));
    },
    subscribe,
  };
}

function createMockFieldPresenceEngine(
  initial: FieldPresenceState[] = [],
): TestFieldPresenceEngine {
  const subscribers = new Set<FieldPresenceSubscriber>();
  let fields = initial.map((field) => cloneTestValue(field));

  const notify = (): void => {
    for (const subscriber of subscribers) {
      subscriber(fields.map((field) => cloneTestValue(field)));
    }
  };

  const setActiveField = vi.fn<FieldPresenceEngine['setActiveField']>();

  const subscribe = vi.fn<(cb: FieldPresenceSubscriber) => () => void>((callback) => {
    subscribers.add(callback);
    callback(fields.map((field) => cloneTestValue(field)));
    return () => {
      subscribers.delete(callback);
    };
  });

  return {
    emit(next: FieldPresenceState[]): void {
      fields = next.map((field) => cloneTestValue(field));
      notify();
    },
    setActiveField,
    getFieldPeers: (fieldId): Peer[] => {
      const match = fields.find((field) => field.fieldId === fieldId);
      return match ? match.peers.map((peer) => cloneTestValue(peer)) : [];
    },
    getActiveFields: (): FieldPresenceState[] => {
      return fields.map((field) => cloneTestValue(field));
    },
    subscribe,
  };
}

function createMockCommentsEngine(initialThreads: CommentThread[] = []): TestCommentsEngine {
  const subscribers = new Set<CommentsSubscriber>();
  let threads = initialThreads.map((thread) => cloneTestValue(thread));

  const notify = (): void => {
    for (const subscriber of subscribers) {
      subscriber(threads.map((thread) => cloneTestValue(thread)));
    }
  };

  const findThread = (threadId: string): CommentThread => {
    const found = threads.find((thread) => thread.id === threadId);
    if (!found) {
      throw new Error(`Mock thread "${threadId}" was not found.`);
    }

    return found;
  };

  const engine = {
    add: vi.fn(async (input: { anchor: CommentThread['anchor']; text: string }) => {
      const thread = createCommentThread(`thread-${threads.length + 1}`, {
        anchor: input.anchor,
        text: input.text,
      });
      threads = [...threads, thread];
      notify();
      return cloneTestValue(thread);
    }),
    reply: vi.fn(async (threadId: string, text: string) => {
      const thread = findThread(threadId);
      thread.replies = [
        ...thread.replies,
        {
          id: `reply-${thread.replies.length + 1}`,
          author: createPeer('author'),
          text,
          createdAt: 2,
        },
      ];
      notify();
      return cloneTestValue(thread);
    }),
    resolve: vi.fn(async (threadId: string) => {
      const thread = findThread(threadId);
      thread.resolved = true;
      notify();
      return cloneTestValue(thread);
    }),
    reopen: vi.fn(async (threadId: string) => {
      const thread = findThread(threadId);
      thread.resolved = false;
      notify();
      return cloneTestValue(thread);
    }),
    thread(threadId: string) {
      return {
        reply: (text: string) => engine.reply(threadId, text),
        resolve: () => engine.resolve(threadId),
        reopen: () => engine.reopen(threadId),
      };
    },
    getAll() {
      return threads.map((thread) => cloneTestValue(thread));
    },
    getByElement(elementId: string) {
      return threads
        .filter((thread) => 'elementId' in thread.anchor && thread.anchor.elementId === elementId)
        .map((thread) => cloneTestValue(thread));
    },
    getOpen() {
      return threads.filter((thread) => !thread.resolved).map((thread) => cloneTestValue(thread));
    },
    subscribe: vi.fn((callback: CommentsSubscriber) => {
      subscribers.add(callback);
      callback(threads.map((thread) => cloneTestValue(thread)));

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextThreads: CommentThread[]) {
      threads = nextThreads.map((thread) => cloneTestValue(thread));
      notify();
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestCommentsEngine;

  return engine;
}

function createMockHistoryEngine(initialTimeline: TimelineEntry[] = []): TestHistoryEngine {
  const subscribers = new Set<HistorySubscriber>();
  let timeline = initialTimeline.map((entry) => cloneTestValue(entry));
  let canUndo = false;
  let canRedo = false;

  const notify = (): void => {
    for (const subscriber of subscribers) {
      subscriber(timeline.map((entry) => cloneTestValue(entry)));
    }
  };

  const engine = {
    capture: vi.fn((action: string, payload?: unknown) => {
      timeline = [
        ...timeline,
        createTimelineEntry(`entry-${timeline.length + 1}`, {
          action,
          description: typeof payload === 'string' && payload.length > 0 ? payload : action,
        }),
      ];
      notify();
    }),
    transaction: vi.fn((name: string, fn: () => void) => {
      fn();
      canUndo = true;
      canRedo = false;
      timeline = [
        ...timeline,
        createTimelineEntry(`entry-${timeline.length + 1}`, { action: name, description: name }),
      ];
      notify();
    }),
    undo: vi.fn(async () => {
      canUndo = false;
      canRedo = true;
      notify();
    }),
    redo: vi.fn(async () => {
      canUndo = true;
      canRedo = false;
      notify();
    }),
    canUndo() {
      return canUndo;
    },
    canRedo() {
      return canRedo;
    },
    timeline() {
      return timeline.map((entry) => cloneTestValue(entry));
    },
    subscribe: vi.fn((callback: HistorySubscriber) => {
      subscribers.add(callback);
      callback(timeline.map((entry) => cloneTestValue(entry)));

      return () => {
        subscribers.delete(callback);
      };
    }),
    emit(nextTimeline: TimelineEntry[]) {
      timeline = nextTimeline.map((entry) => cloneTestValue(entry));
      notify();
    },
    setCanUndo(value: boolean) {
      canUndo = value;
      notify();
    },
    setCanRedo(value: boolean) {
      canRedo = value;
      notify();
    },
    subscriberCount() {
      return subscribers.size;
    },
  } as TestHistoryEngine;

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
    agentApprovalEngine?: TestAgentApprovalEngine;
    awarenessEngine?: TestAwarenessEngine;
    commentsEngine?: TestCommentsEngine;
    cursorEngine?: TestCursorEngine;
    eventEngine?: TestEventEngine;
    fieldPresenceEngine?: TestFieldPresenceEngine;
    historyEngine?: TestHistoryEngine;
    lockEngine?: TestLockEngine;
    peerId?: string;
    pointerEngine?: TestPointerEngine;
    presenceEngine?: TestPresenceEngine;
    status?: RoomStatus;
    stateEngine?: TestStateEngine<unknown>;
    viewportEngine?: TestViewportEngine;
  } = {},
): TestRoom {
  const handlers = new Map<RoomEventName, Set<RoomEventHandler>>();
  const peerId = config.peerId ?? `${roomId}-peer`;
  const activityEngine = config.activityEngine ?? createMockActivityEngine();
  const agentApprovalEngine = config.agentApprovalEngine ?? createMockAgentApprovalEngine();
  const awarenessEngine = config.awarenessEngine ?? createMockAwarenessEngine();
  const fieldPresenceEngine = config.fieldPresenceEngine ?? createMockFieldPresenceEngine();
  const commentsEngine = config.commentsEngine ?? createMockCommentsEngine();
  const cursorEngine = config.cursorEngine ?? createMockCursorEngine();
  const eventEngine = config.eventEngine ?? createMockEventEngine();
  const historyEngine = config.historyEngine ?? createMockHistoryEngine();
  const lockEngine = config.lockEngine ?? createMockLockEngine();
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
    useAgentApprovals: vi.fn(() => {
      return agentApprovalEngine;
    }),
    useFieldPresence: vi.fn(() => {
      return fieldPresenceEngine;
    }),
    useHistory: vi.fn(() => {
      return historyEngine;
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

async function renderElement(element: ReactNode): Promise<RenderHarness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return {
    rerender: async (nextElement) => {
      await act(async () => {
        root.render(nextElement);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  createRoomMock.mockReset();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RoomfulProvider', () => {
  it('creates a room during render, connects on mount, and exposes it via useRoom()', async () => {
    const room = createMockRoom('provider-room', {
      transport: 'broadcast',
    });
    let observedRoom: Room<PresenceData> | null = null;

    function RoomConsumer(): null {
      observedRoom = useRoom();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'provider-room',
          transport: 'broadcast',
        },
        createElement(RoomConsumer),
      ),
    );

    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(observedRoom).toBe(room);

    await harness.unmount();
  });

  it('disconnects the room cleanly on unmount', async () => {
    const room = createMockRoom('disconnect-room');
    const harness = await renderElement(
      createElement(RoomfulProvider, { roomId: 'disconnect-room' }),
    );

    await harness.unmount();

    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it('forwards connected, disconnected, and error events to provider callbacks', async () => {
    const room = createMockRoom('callback-room');
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onError = vi.fn();
    const harness = await renderElement(
      createElement(RoomfulProvider, {
        roomId: 'callback-room',
        onConnect,
        onDisconnect,
        onError,
      }),
    );
    const error = new RoomfulError('NETWORK_ERROR', 'boom', true);

    room.emit('connected', undefined);
    room.emit('disconnected', { reason: 'manual' });
    room.emit('error', error);

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith({ reason: 'manual' });
    expect(onError).toHaveBeenCalledWith(error);

    await harness.unmount();
  });

  it('does not recreate or reconnect when rerendered with equivalent room props', async () => {
    const room = createMockRoom('stable-room', {
      transport: 'broadcast',
      presence: {
        name: 'Ada',
      },
      stunUrls: ['stun:1.example.net', 'stun:2.example.net'],
    });
    const initialOnConnect = vi.fn();
    const updatedOnConnect = vi.fn();
    const harness = await renderElement(
      createElement(RoomfulProvider, {
        roomId: 'stable-room',
        transport: 'broadcast',
        presence: {
          name: 'Ada',
        },
        stunUrls: ['stun:1.example.net', 'stun:2.example.net'],
        onConnect: initialOnConnect,
      }),
    );

    await harness.rerender(
      createElement(RoomfulProvider, {
        roomId: 'stable-room',
        transport: 'broadcast',
        presence: {
          name: 'Ada',
        },
        stunUrls: ['stun:1.example.net', 'stun:2.example.net'],
        onConnect: updatedOnConnect,
      }),
    );

    room.emit('connected', undefined);

    expect(createRoomMock).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(room.disconnect).toHaveBeenCalledTimes(0);
    expect(initialOnConnect).toHaveBeenCalledTimes(0);
    expect(updatedOnConnect).toHaveBeenCalledTimes(1);

    await harness.unmount();
  });

  it('recreates the room when the roomId changes', async () => {
    const firstRoom = createMockRoom('room-a');
    const secondRoom = createMockRoom('room-b');
    const harness = await renderElement(createElement(RoomfulProvider, { roomId: 'room-a' }));

    await harness.rerender(createElement(RoomfulProvider, { roomId: 'room-b' }));

    expect(createRoomMock).toHaveBeenCalledTimes(2);
    expect(firstRoom.connect).toHaveBeenCalledTimes(1);
    expect(firstRoom.disconnect).toHaveBeenCalledTimes(1);
    expect(secondRoom.connect).toHaveBeenCalledTimes(1);
    expect(secondRoom.disconnect).toHaveBeenCalledTimes(0);

    await harness.unmount();
    expect(secondRoom.disconnect).toHaveBeenCalledTimes(1);
  });

  it('recreates the room when a room-defining option changes', async () => {
    const firstRoom = createMockRoom('option-room', {
      transport: 'broadcast',
      debug: {
        transport: false,
      },
    });
    const secondRoom = createMockRoom('option-room', {
      transport: 'websocket',
      debug: {
        transport: true,
      },
    });
    const harness = await renderElement(
      createElement(RoomfulProvider, {
        roomId: 'option-room',
        transport: 'broadcast',
        debug: {
          transport: false,
        },
      }),
    );

    await harness.rerender(
      createElement(RoomfulProvider, {
        roomId: 'option-room',
        transport: 'websocket',
        debug: {
          transport: true,
        },
      }),
    );

    expect(createRoomMock).toHaveBeenCalledTimes(2);
    expect(firstRoom.disconnect).toHaveBeenCalledTimes(1);
    expect(secondRoom.connect).toHaveBeenCalledTimes(1);

    await harness.unmount();
  });

  it('throws a typed error when useRoom() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useRoom();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('RoomfulProvider');
  });
});

describe('usePresence', () => {
  it('returns self, others, all, and presence mutators', async () => {
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
    let observedPresence: UsePresenceResult<PresenceData> | null = null;

    function PresenceConsumer(): null {
      observedPresence = usePresence();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'presence-room',
        },
        createElement(PresenceConsumer),
      ),
    );

    expect(observedPresence?.self).toEqual(self);
    expect(observedPresence?.others).toEqual([other]);
    expect(observedPresence?.all).toEqual([self, other]);

    observedPresence?.update({ status: 'online' });
    observedPresence?.replace({ name: 'Ada Lovelace' });

    expect(presenceEngine.update).toHaveBeenCalledWith({ status: 'online' });
    expect(presenceEngine.replace).toHaveBeenCalledWith({ name: 'Ada Lovelace' });

    await harness.unmount();
  });

  it('rerenders when peers join, leave, or meaningfully update', async () => {
    const self = createPeer('react-self', { name: 'Self' });
    const peerA = createPeer('react-peer-a', { name: 'Peer A' });
    const peerB = createPeer('react-peer-b', { name: 'Peer B' });
    const presenceEngine = createMockPresenceEngine('react-self', [self]);
    createMockRoom(
      'presence-reactivity',
      {},
      {
        peerId: 'react-self',
        presenceEngine,
      },
    );
    const snapshots: UsePresenceResult<PresenceData>[] = [];

    function PresenceConsumer(): null {
      snapshots.push(usePresence());
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'presence-reactivity',
        },
        createElement(PresenceConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([self, peerA]);
    });
    await act(async () => {
      presenceEngine.emit([self, peerA, peerB]);
    });
    await act(async () => {
      presenceEngine.emit([
        self,
        createPeer('react-peer-a', { name: 'Peer A+', role: 'editor' }),
        peerB,
      ]);
    });
    await act(async () => {
      presenceEngine.emit([self, peerB]);
    });

    expect(snapshots).toHaveLength(5);
    expect(snapshots[1]?.others.map((peer) => peer.id)).toEqual(['react-peer-a']);
    expect(snapshots[2]?.others.map((peer) => peer.id)).toEqual(['react-peer-a', 'react-peer-b']);
    expect(snapshots[3]?.others[0]).toMatchObject({
      id: 'react-peer-a',
      name: 'Peer A+',
      role: 'editor',
    });
    expect(snapshots[4]?.others.map((peer) => peer.id)).toEqual(['react-peer-b']);

    await harness.unmount();
  });

  it('does not rerender when peer data is deep-equal or only lastSeen changes', async () => {
    const self = createPeer('equal-self', { name: 'Self' });
    const other = createPeer('equal-other', {
      name: 'Other',
      metadata: {
        role: 'editor',
        permissions: ['read', 'write'],
      },
    });
    const presenceEngine = createMockPresenceEngine('equal-self', [self, other]);
    createMockRoom(
      'presence-equality',
      {},
      {
        peerId: 'equal-self',
        presenceEngine,
      },
    );
    let renderCount = 0;

    function PresenceConsumer(): null {
      usePresence();
      renderCount += 1;
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'presence-equality',
        },
        createElement(PresenceConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([
        createPeer('equal-self', { name: 'Self' }),
        createPeer('equal-other', {
          name: 'Other',
          metadata: {
            role: 'editor',
            permissions: ['read', 'write'],
          },
        }),
      ]);
    });
    await act(async () => {
      presenceEngine.emit([
        createPeer('equal-self', { name: 'Self', lastSeen: 2 }),
        createPeer('equal-other', {
          name: 'Other',
          lastSeen: 99,
          metadata: {
            role: 'editor',
            permissions: ['read', 'write'],
          },
        }),
      ]);
    });

    expect(renderCount).toBe(1);

    await harness.unmount();
  });

  it('preserves stable slice references when unchanged', async () => {
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
    const snapshots: UsePresenceResult<PresenceData>[] = [];

    function PresenceConsumer(): null {
      snapshots.push(usePresence());
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'presence-stable-slices',
        },
        createElement(PresenceConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([
        createPeer('stable-self', { name: 'Self Renamed', role: 'owner' }),
        createPeer('stable-other', { name: 'Other', role: 'editor' }),
      ]);
    });
    await act(async () => {
      presenceEngine.emit([
        createPeer('stable-self', { name: 'Self Renamed', role: 'owner' }),
        createPeer('stable-other', { name: 'Other+', role: 'editor' }),
      ]);
    });

    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]?.others).toBe(snapshots[0]?.others);
    expect(snapshots[2]?.self).toBe(snapshots[1]?.self);

    await harness.unmount();
  });

  it('follows room replacement and resubscribes to the new room presence engine', async () => {
    const roomAPresence = createMockPresenceEngine('room-a-peer', [
      createPeer('room-a-peer', { name: 'Room A Self' }),
    ]);
    const roomBPresence = createMockPresenceEngine('room-b-peer', [
      createPeer('room-b-peer', { name: 'Room B Self' }),
    ]);
    createMockRoom(
      'presence-room-a',
      {},
      {
        peerId: 'room-a-peer',
        presenceEngine: roomAPresence,
      },
    );
    createMockRoom(
      'presence-room-b',
      {},
      {
        peerId: 'room-b-peer',
        presenceEngine: roomBPresence,
      },
    );
    const snapshots: UsePresenceResult<PresenceData>[] = [];

    function PresenceConsumer(): null {
      snapshots.push(usePresence());
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'presence-room-a',
        },
        createElement(PresenceConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'presence-room-b',
        },
        createElement(PresenceConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomAPresence.emit([
        createPeer('room-a-peer', { name: 'Room A Self' }),
        createPeer('room-a-other', { name: 'A Other' }),
      ]);
    });
    await act(async () => {
      roomBPresence.emit([
        createPeer('room-b-peer', { name: 'Room B Self' }),
        createPeer('room-b-other', { name: 'B Other' }),
      ]);
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots[1]?.self.id).toBe('room-b-peer');
    expect(snapshots[1]?.all).toEqual([createPeer('room-b-peer', { name: 'Room B Self' })]);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]?.others.map((peer) => peer.id)).toEqual(['room-b-other']);
    expect(roomAPresence.subscriberCount()).toBe(0);
    expect(roomBPresence.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('throws a typed error when usePresence() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      usePresence();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('RoomfulProvider');
  });
});

describe('useAwareness', () => {
  it('returns remote awareness and forwards awareness mutators', async () => {
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
    let observedAwareness: UseAwarenessResult | null = null;

    function AwarenessConsumer(): null {
      observedAwareness = useAwareness();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'awareness-room',
        },
        createElement(AwarenessConsumer),
      ),
    );

    expect(observedAwareness?.others).toEqual([other]);

    observedAwareness?.set({
      mode: 'draft',
    });
    observedAwareness?.setFocus('comment-1');
    observedAwareness?.setSelection({
      from: 5,
      to: 8,
      elementId: 'comment-1',
    });
    observedAwareness?.setTyping(false);

    expect(awarenessEngine.set).toHaveBeenCalledWith({
      mode: 'draft',
    });
    expect(awarenessEngine.setFocus).toHaveBeenCalledWith('comment-1');
    expect(awarenessEngine.setSelection).toHaveBeenCalledWith({
      from: 5,
      to: 8,
      elementId: 'comment-1',
    });
    expect(awarenessEngine.setTyping).toHaveBeenCalledWith(false);

    await harness.unmount();
  });

  it('rerenders for remote awareness changes and skips self-only or deep-equal updates', async () => {
    const self = createAwareness('awareness-reactive-self', {
      typing: false,
    });
    const other = createAwareness('awareness-reactive-other', {
      focus: 'editor-1',
      metadata: {
        mode: 'draft',
      },
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
    const snapshots: UseAwarenessResult[] = [];
    let renderCount = 0;

    function AwarenessConsumer(): null {
      const awareness = useAwareness();
      renderCount += 1;
      snapshots.push(awareness);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'awareness-reactivity',
        },
        createElement(AwarenessConsumer),
      ),
    );

    await act(async () => {
      awarenessEngine.emit([
        createAwareness('awareness-reactive-self', {
          typing: true,
        }),
        createAwareness('awareness-reactive-other', {
          focus: 'editor-1',
          metadata: {
            mode: 'draft',
          },
        }),
      ]);
    });
    await act(async () => {
      awarenessEngine.emit([
        createAwareness('awareness-reactive-self', {
          typing: true,
        }),
        createAwareness('awareness-reactive-other', {
          focus: 'editor-2',
          metadata: {
            mode: 'review',
          },
        }),
      ]);
    });
    await act(async () => {
      awarenessEngine.emit([
        createAwareness('awareness-reactive-self', {
          typing: true,
        }),
        createAwareness('awareness-reactive-other', {
          focus: 'editor-2',
          metadata: {
            mode: 'review',
          },
        }),
      ]);
    });

    expect(renderCount).toBe(2);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.others).toEqual([
      createAwareness('awareness-reactive-other', {
        focus: 'editor-2',
        metadata: {
          mode: 'review',
        },
      }),
    ]);

    await harness.unmount();
  });

  it('keeps mutators stable across room replacement and cleans up old subscriptions', async () => {
    const roomAAwareness = createMockAwarenessEngine([
      createAwareness('awareness-room-a-peer', {
        focus: 'board-a',
      }),
    ]);
    const roomBAwareness = createMockAwarenessEngine([
      createAwareness('awareness-room-b-peer', {
        focus: 'board-b',
      }),
    ]);
    createMockRoom(
      'awareness-room-a',
      {},
      {
        awarenessEngine: roomAAwareness,
        peerId: 'awareness-room-a-peer',
      },
    );
    createMockRoom(
      'awareness-room-b',
      {},
      {
        awarenessEngine: roomBAwareness,
        peerId: 'awareness-room-b-peer',
      },
    );
    const snapshots: UseAwarenessResult[] = [];

    function AwarenessConsumer(): null {
      snapshots.push(useAwareness());
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'awareness-room-a',
        },
        createElement(AwarenessConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'awareness-room-b',
        },
        createElement(AwarenessConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomAAwareness.emit([
        createAwareness('awareness-room-a-peer', {
          focus: 'board-a',
        }),
        createAwareness('awareness-room-a-other', {
          typing: true,
        }),
      ]);
    });
    await act(async () => {
      snapshots[1]?.setTyping(true);
      roomBAwareness.emit([
        createAwareness('awareness-room-b-peer', {
          focus: 'board-b',
        }),
        createAwareness('awareness-room-b-other', {
          typing: true,
        }),
      ]);
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]?.set).toBe(snapshots[0]?.set);
    expect(snapshots[1]?.setFocus).toBe(snapshots[0]?.setFocus);
    expect(snapshots[1]?.setSelection).toBe(snapshots[0]?.setSelection);
    expect(snapshots[1]?.setTyping).toBe(snapshots[0]?.setTyping);
    expect(snapshots[2]?.others).toEqual([
      createAwareness('awareness-room-b-other', {
        typing: true,
      }),
    ]);
    expect(roomAAwareness.subscriberCount()).toBe(0);
    expect(roomBAwareness.subscriberCount()).toBe(1);
    expect(roomAAwareness.setTyping).toHaveBeenCalledTimes(0);
    expect(roomBAwareness.setTyping).toHaveBeenCalledWith(true);

    await harness.unmount();

    expect(roomBAwareness.subscriberCount()).toBe(0);
  });
});

describe('usePeers', () => {
  it('returns reactive remote peers and excludes the local peer', async () => {
    const self = createPeer('peers-self', {
      name: 'Self',
    });
    const peerA = createPeer('peers-a', {
      name: 'Peer A',
    });
    const peerB = createPeer('peers-b', {
      name: 'Peer B',
    });
    const presenceEngine = createMockPresenceEngine('peers-self', [self, peerA]);
    createMockRoom(
      'peers-room',
      {},
      {
        peerId: 'peers-self',
        presenceEngine,
      },
    );
    const snapshots: Peer<PresenceData>[][] = [];

    function PeersConsumer(): null {
      snapshots.push(usePeers());
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'peers-room',
        },
        createElement(PeersConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([self, peerA, peerB]);
    });

    expect(snapshots).toEqual([[peerA], [peerA, peerB]]);

    await harness.unmount();
  });

  it('skips deep-equal peer updates and lastSeen-only churn', async () => {
    const self = createPeer('peers-equal-self', {
      name: 'Self',
    });
    const other = createPeer('peers-equal-other', {
      name: 'Other',
      metadata: {
        role: 'editor',
      },
    });
    const presenceEngine = createMockPresenceEngine('peers-equal-self', [self, other]);
    createMockRoom(
      'peers-equality',
      {},
      {
        peerId: 'peers-equal-self',
        presenceEngine,
      },
    );
    let renderCount = 0;

    function PeersConsumer(): null {
      usePeers();
      renderCount += 1;
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'peers-equality',
        },
        createElement(PeersConsumer),
      ),
    );

    await act(async () => {
      presenceEngine.emit([
        createPeer('peers-equal-self', {
          name: 'Self',
        }),
        createPeer('peers-equal-other', {
          name: 'Other',
          metadata: {
            role: 'editor',
          },
        }),
      ]);
    });
    await act(async () => {
      presenceEngine.emit([
        createPeer('peers-equal-self', {
          name: 'Self',
          lastSeen: 2,
        }),
        createPeer('peers-equal-other', {
          name: 'Other',
          lastSeen: 99,
          metadata: {
            role: 'editor',
          },
        }),
      ]);
    });

    expect(renderCount).toBe(1);

    await harness.unmount();
  });

  it('follows room replacement and resubscribes to the new peer source', async () => {
    const roomAPresence = createMockPresenceEngine('peers-room-a-peer', [
      createPeer('peers-room-a-peer', {
        name: 'Room A Self',
      }),
    ]);
    const roomBPresence = createMockPresenceEngine('peers-room-b-peer', [
      createPeer('peers-room-b-peer', {
        name: 'Room B Self',
      }),
    ]);
    createMockRoom(
      'peers-room-a',
      {},
      {
        peerId: 'peers-room-a-peer',
        presenceEngine: roomAPresence,
      },
    );
    createMockRoom(
      'peers-room-b',
      {},
      {
        peerId: 'peers-room-b-peer',
        presenceEngine: roomBPresence,
      },
    );
    const snapshots: Peer<PresenceData>[][] = [];

    function PeersConsumer(): null {
      snapshots.push(usePeers());
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'peers-room-a',
        },
        createElement(PeersConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'peers-room-b',
        },
        createElement(PeersConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomAPresence.emit([
        createPeer('peers-room-a-peer', {
          name: 'Room A Self',
        }),
        createPeer('peers-room-a-other', {
          name: 'A Other',
        }),
      ]);
    });
    await act(async () => {
      roomBPresence.emit([
        createPeer('peers-room-b-peer', {
          name: 'Room B Self',
        }),
        createPeer('peers-room-b-other', {
          name: 'B Other',
        }),
      ]);
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots[1]).toEqual([]);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]).toEqual([
      createPeer('peers-room-b-other', {
        name: 'B Other',
      }),
    ]);
    expect(roomAPresence.subscriberCount()).toBe(0);
    expect(roomBPresence.subscriberCount()).toBe(1);

    await harness.unmount();
  });
});

describe('useConnectionStatus', () => {
  it('tracks room status transitions, including the initial connecting state', async () => {
    const room = createMockRoom('connection-status-room');
    const statuses: RoomStatus[] = [];

    function StatusConsumer(): null {
      statuses.push(useConnectionStatus());
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'connection-status-room',
        },
        createElement(StatusConsumer),
      ),
    );

    await act(async () => {
      room.emit('connected', undefined);
    });
    await act(async () => {
      room.emit('reconnecting', {
        attempt: 1,
      });
    });
    await act(async () => {
      room.emit('disconnected', {
        reason: 'manual',
      });
    });
    await act(async () => {
      room.emit('error', new RoomfulError('NETWORK_ERROR', 'boom', true));
    });

    expect(statuses).toContain('idle');
    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('reconnecting');
    expect(statuses).toContain('disconnected');
    expect(statuses).toContain('error');

    await harness.unmount();

    expect(room.listenerCount('connected')).toBe(0);
    expect(room.listenerCount('reconnecting')).toBe(0);
    expect(room.listenerCount('disconnected')).toBe(0);
    expect(room.listenerCount('error')).toBe(0);
  });
});

describe('useEvent', () => {
  it('subscribes once, emits outbound events, and delivers to the latest handler', async () => {
    const eventEngine = createMockEventEngine();
    createMockRoom(
      'event-room',
      {},
      {
        eventEngine,
      },
    );
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const emitters: Array<(payload: { text: string }) => void> = [];
    let useUpdatedHandler = false;

    function EventConsumer(): null {
      const emitMessage = useEvent<{ text: string }>(
        'message',
        useUpdatedHandler ? secondHandler : firstHandler,
      );
      emitters.push(emitMessage);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'event-room',
        },
        createElement(EventConsumer),
      ),
    );

    await act(async () => {
      emitters[0]?.({
        text: 'outbound',
      });
    });
    await act(async () => {
      eventEngine.deliver(
        'message',
        {
          text: 'first',
        },
        createPeer('sender-a', {
          name: 'Sender A',
        }),
      );
    });

    useUpdatedHandler = true;
    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'event-room',
        },
        createElement(EventConsumer),
      ),
    );

    await act(async () => {
      eventEngine.deliver(
        'message',
        {
          text: 'second',
        },
        createPeer('sender-b', {
          name: 'Sender B',
        }),
      );
    });

    expect(eventEngine.emit).toHaveBeenCalledWith('message', {
      text: 'outbound',
    });
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenCalledWith(
      {
        text: 'first',
      },
      expect.objectContaining({
        id: 'sender-a',
        name: 'Sender A',
      }),
    );
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledWith(
      {
        text: 'second',
      },
      expect.objectContaining({
        id: 'sender-b',
        name: 'Sender B',
      }),
    );
    expect(eventEngine.on).toHaveBeenCalledTimes(1);
    expect(eventEngine.subscriberCount('message')).toBe(1);
    expect(emitters[1]).toBe(emitters[0]);

    await harness.unmount();

    expect(eventEngine.subscriberCount('message')).toBe(0);
  });

  it('resubscribes on room replacement and keeps emit stable', async () => {
    const roomAEvents = createMockEventEngine();
    const roomBEvents = createMockEventEngine();
    createMockRoom(
      'event-room-a',
      {},
      {
        eventEngine: roomAEvents,
      },
    );
    createMockRoom(
      'event-room-b',
      {},
      {
        eventEngine: roomBEvents,
      },
    );
    const received = vi.fn();
    const emitters: Array<(payload: { value: number }) => void> = [];

    function EventConsumer(): null {
      const emitValue = useEvent<{ value: number }>('value', received);
      emitters.push(emitValue);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'event-room-a',
        },
        createElement(EventConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'event-room-b',
        },
        createElement(EventConsumer),
      ),
    );

    await act(async () => {
      roomAEvents.deliver('value', {
        value: 1,
      });
    });
    await act(async () => {
      roomBEvents.deliver('value', {
        value: 2,
      });
      emitters[1]?.({
        value: 3,
      });
    });

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(
      {
        value: 2,
      },
      expect.objectContaining({
        id: 'event-source',
      }),
    );
    expect(roomAEvents.subscriberCount('value')).toBe(0);
    expect(roomBEvents.subscriberCount('value')).toBe(1);
    expect(emitters[1]).toBe(emitters[0]);
    expect(roomAEvents.emit).toHaveBeenCalledTimes(0);
    expect(roomBEvents.emit).toHaveBeenCalledWith('value', {
      value: 3,
    });

    await harness.unmount();

    expect(roomBEvents.subscriberCount('value')).toBe(0);
  });

  it('preserves event emit and handler types', () => {
    function TypeConsumer(): null {
      const emitMessage = useEvent<{ text: string }>('message', (payload, from) => {
        expectTypeOf(payload).toEqualTypeOf<{ text: string }>();
        expectTypeOf(from).toEqualTypeOf<Peer<PresenceData>>();
      });

      expectTypeOf(emitMessage).toEqualTypeOf<(payload: { text: string }) => void>();

      return null;
    }

    expect(TypeConsumer).toBeTypeOf('function');
  });
});

describe('useCursors', () => {
  it('returns ref, cursors, mount, and unmount while auto-mounting the tracked element', async () => {
    const remoteCursor = createCursor('cursor-peer', {
      tool: 'pen',
    });
    const cursorEngine = createMockCursorEngine([remoteCursor]);
    createMockRoom(
      'cursor-room',
      {},
      {
        cursorEngine,
      },
    );
    let observedCursors: UseCursorsResult<CursorData> | null = null;

    function CursorConsumer(): ReactNode {
      observedCursors = useCursors();
      return createElement('div', {
        id: 'cursor-board',
        ref: observedCursors.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'cursor-room',
        },
        createElement(CursorConsumer),
      ),
    );
    const board = document.getElementById('cursor-board') as HTMLElement;

    expect(observedCursors?.cursors).toEqual([remoteCursor]);
    expect(typeof observedCursors?.ref).toBe('function');
    expect(typeof observedCursors?.mount).toBe('function');
    expect(typeof observedCursors?.unmount).toBe('function');
    expect(cursorEngine.mount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(board);

    await act(async () => {
      observedCursors?.unmount();
      observedCursors?.mount(board);
    });

    expect(cursorEngine.unmount).toHaveBeenCalledTimes(1);
    expect(cursorEngine.mount).toHaveBeenCalledTimes(2);
    expect(cursorEngine.mount).toHaveBeenLastCalledWith(board);

    await harness.unmount();

    expect(cursorEngine.unmount).toHaveBeenCalledTimes(2);
  });

  it('rerenders when cursor snapshots change and skips deep-equal updates', async () => {
    const initialCursor = createCursor('cursor-peer', {
      tool: 'pen',
      metadata: {
        pressure: 0.5,
      },
    });
    const cursorEngine = createMockCursorEngine([initialCursor]);
    createMockRoom(
      'cursor-reactivity',
      {},
      {
        cursorEngine,
      },
    );
    const snapshots: Array<CursorPosition<CursorData>[]> = [];
    let renderCount = 0;

    function CursorConsumer(): ReactNode {
      const cursorState = useCursors();
      renderCount += 1;
      snapshots.push(cursorState.cursors);
      return createElement('div', {
        id: 'cursor-reactivity-board',
        ref: cursorState.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'cursor-reactivity',
        },
        createElement(CursorConsumer),
      ),
    );

    await act(async () => {
      cursorEngine.emit([
        createCursor('cursor-peer', {
          tool: 'pen',
          metadata: {
            pressure: 0.5,
          },
        }),
      ]);
    });
    await act(async () => {
      cursorEngine.emit([
        createCursor('cursor-peer', {
          x: 0.6,
          xAbsolute: 60,
          tool: 'pen',
          metadata: {
            pressure: 0.9,
          },
        }),
      ]);
    });

    expect(renderCount).toBe(2);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      x: 0.6,
      xAbsolute: 60,
      metadata: {
        pressure: 0.9,
      },
    });
    expect(cursorEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('preserves the cursor array reference across parent rerenders when unchanged', async () => {
    const cursorEngine = createMockCursorEngine([
      createCursor('cursor-peer', {
        tool: 'pen',
      }),
    ]);
    createMockRoom(
      'cursor-stability',
      {},
      {
        cursorEngine,
      },
    );
    const cursorArrays: Array<CursorPosition<CursorData>[]> = [];

    function CursorConsumer(): ReactNode {
      const cursorState = useCursors();
      cursorArrays.push(cursorState.cursors);
      return createElement('div', {
        id: 'cursor-stability-board',
        ref: cursorState.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'cursor-stability',
        },
        createElement(CursorConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'cursor-stability',
        },
        createElement(CursorConsumer),
      ),
    );

    expect(cursorArrays).toHaveLength(2);
    expect(cursorArrays[1]).toBe(cursorArrays[0]);
    expect(cursorEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('follows room replacement, resubscribes, and remounts the tracked element', async () => {
    const roomACursorEngine = createMockCursorEngine([
      createCursor('room-a-peer', {
        tool: 'pen',
      }),
    ]);
    const roomBCursorEngine = createMockCursorEngine([
      createCursor('room-b-peer', {
        tool: 'eraser',
      }),
    ]);
    createMockRoom(
      'cursor-room-a',
      {},
      {
        cursorEngine: roomACursorEngine,
      },
    );
    createMockRoom(
      'cursor-room-b',
      {},
      {
        cursorEngine: roomBCursorEngine,
      },
    );
    const snapshots: Array<CursorPosition<CursorData>[]> = [];

    function CursorConsumer(): ReactNode {
      const cursorState = useCursors();
      snapshots.push(cursorState.cursors);
      return createElement('div', {
        id: 'cursor-room-swap-board',
        ref: cursorState.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'cursor-room-a',
        },
        createElement(CursorConsumer),
      ),
    );
    const board = document.getElementById('cursor-room-swap-board') as HTMLElement;

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'cursor-room-b',
        },
        createElement(CursorConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomACursorEngine.emit([createCursor('room-a-other', { tool: 'pen' })]);
    });
    await act(async () => {
      roomBCursorEngine.emit([
        createCursor('room-b-other', {
          tool: 'eraser',
          metadata: {
            pressure: 0.4,
          },
        }),
      ]);
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots[1]).toEqual([
      createCursor('room-b-peer', {
        tool: 'eraser',
      }),
    ]);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]?.[0]).toMatchObject({
      userId: 'room-b-other',
      tool: 'eraser',
      metadata: {
        pressure: 0.4,
      },
    });
    expect(roomACursorEngine.subscriberCount()).toBe(0);
    expect(roomBCursorEngine.subscriberCount()).toBe(1);
    expect(roomACursorEngine.unmount).toHaveBeenCalled();
    expect(roomBCursorEngine.mount).toHaveBeenCalledWith(board);

    await harness.unmount();
  });

  it('throws a typed error when useCursors() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useCursors();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('RoomfulProvider');
  });
});

describe('useViewport', () => {
  it('returns ref, states, and controls while auto-mounting the tracked element', async () => {
    const remoteViewport = createViewport('viewport-peer', {
      scrollY: 0.5,
    });
    const viewportEngine = createMockViewportEngine([remoteViewport]);
    createMockRoom(
      'viewport-room',
      {},
      {
        viewportEngine,
      },
    );
    let observed: UseViewportResult | null = null;

    function ViewportConsumer(): ReactNode {
      observed = useViewport();
      return createElement('div', {
        id: 'viewport-board',
        ref: observed.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'viewport-room',
        },
        createElement(ViewportConsumer),
      ),
    );
    const board = document.getElementById('viewport-board') as HTMLElement;

    expect(observed?.states).toEqual([remoteViewport]);
    expect(typeof observed?.ref).toBe('function');
    expect(viewportEngine.mount).toHaveBeenCalledTimes(1);
    expect(viewportEngine.mount).toHaveBeenLastCalledWith(board);

    observed?.broadcast();
    observed?.stopBroadcast();
    observed?.present();
    observed?.stopPresenting();
    observed?.follow('viewport-peer');
    observed?.unfollow();

    expect(viewportEngine.broadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopBroadcast).toHaveBeenCalledTimes(1);
    expect(viewportEngine.present).toHaveBeenCalledTimes(1);
    expect(viewportEngine.stopPresenting).toHaveBeenCalledTimes(1);
    expect(viewportEngine.follow).toHaveBeenCalledWith('viewport-peer');
    expect(viewportEngine.unfollow).toHaveBeenCalledTimes(1);

    await harness.unmount();

    expect(viewportEngine.unmount).toHaveBeenCalled();
  });

  it('rerenders when viewport states change and skips deep-equal updates', async () => {
    const viewportEngine = createMockViewportEngine([
      createViewport('viewport-peer', {
        scrollY: 0.25,
      }),
    ]);
    createMockRoom(
      'viewport-reactivity',
      {},
      {
        viewportEngine,
      },
    );
    const snapshots: ViewportState[][] = [];
    let renderCount = 0;

    function ViewportConsumer(): ReactNode {
      const viewport = useViewport();
      renderCount += 1;
      snapshots.push(viewport.states);
      return createElement('div', {
        id: 'viewport-reactivity-board',
        ref: viewport.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'viewport-reactivity',
        },
        createElement(ViewportConsumer),
      ),
    );

    await act(async () => {
      viewportEngine.emit([
        createViewport('viewport-peer', {
          scrollY: 0.25,
        }),
      ]);
    });
    await act(async () => {
      viewportEngine.emit([
        createViewport('viewport-peer', {
          scrollY: 0.9,
        }),
      ]);
    });

    expect(renderCount).toBe(2);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({
      scrollY: 0.9,
    });
    expect(viewportEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('preserves stable control identities and keeps controls usable', async () => {
    const viewportEngine = createMockViewportEngine();
    createMockRoom(
      'viewport-stability',
      {},
      {
        viewportEngine,
      },
    );
    const snapshots: UseViewportResult[] = [];

    function ViewportConsumer(): ReactNode {
      const viewport = useViewport();
      snapshots.push(viewport);
      return createElement('div', {
        id: 'viewport-stability-board',
        ref: viewport.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'viewport-stability',
        },
        createElement(ViewportConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'viewport-stability',
        },
        createElement(ViewportConsumer),
      ),
    );

    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(snapshots[1]?.broadcast).toBe(snapshots[0]?.broadcast);
    expect(snapshots[1]?.follow).toBe(snapshots[0]?.follow);
    expect(snapshots[1]?.present).toBe(snapshots[0]?.present);

    await harness.unmount();
  });

  it('throws a typed error when useViewport() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useViewport();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('RoomfulProvider');
  });
});

describe('usePointer', () => {
  it('returns ref, beams, and controls while auto-mounting the tracked element', async () => {
    const remoteBeam = createBeam('pointer-peer', { x: 0.4, y: 0.6 });
    const pointerEngine = createMockPointerEngine([remoteBeam]);
    createMockRoom(
      'pointer-room',
      {},
      {
        pointerEngine,
      },
    );
    let observed: UsePointerResult | null = null;

    function PointerConsumer(): ReactNode {
      observed = usePointer();
      return createElement('div', {
        id: 'pointer-board',
        ref: observed.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'pointer-room',
        },
        createElement(PointerConsumer),
      ),
    );
    const board = document.getElementById('pointer-board') as HTMLElement;

    expect(observed?.beams).toEqual([remoteBeam]);
    expect(typeof observed?.ref).toBe('function');
    expect(pointerEngine.mount).toHaveBeenCalledTimes(1);
    expect(pointerEngine.mount).toHaveBeenLastCalledWith(board);

    observed?.activate();
    observed?.deactivate();
    const cleanup = observed?.render({ style: 'laser' });

    expect(pointerEngine.activate).toHaveBeenCalledTimes(1);
    expect(pointerEngine.deactivate).toHaveBeenCalledTimes(1);
    expect(pointerEngine.render).toHaveBeenCalledWith({ style: 'laser' });
    expect(typeof cleanup).toBe('function');

    await harness.unmount();

    expect(pointerEngine.unmount).toHaveBeenCalled();
  });

  it('rerenders when beams change and skips deep-equal updates', async () => {
    const pointerEngine = createMockPointerEngine([createBeam('pointer-peer', { x: 0.1 })]);
    createMockRoom(
      'pointer-reactivity',
      {},
      {
        pointerEngine,
      },
    );
    const snapshots: PointerBeam[][] = [];
    let renderCount = 0;

    function PointerConsumer(): ReactNode {
      const pointer = usePointer();
      renderCount += 1;
      snapshots.push(pointer.beams);
      return createElement('div', {
        id: 'pointer-reactivity-board',
        ref: pointer.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'pointer-reactivity',
        },
        createElement(PointerConsumer),
      ),
    );

    await act(async () => {
      pointerEngine.emit([createBeam('pointer-peer', { x: 0.1 })]);
    });
    await act(async () => {
      pointerEngine.emit([createBeam('pointer-peer', { x: 0.9 })]);
    });

    expect(renderCount).toBe(2);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.[0]).toMatchObject({ x: 0.9 });
    expect(pointerEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('preserves stable control identities and keeps controls usable', async () => {
    const pointerEngine = createMockPointerEngine();
    createMockRoom(
      'pointer-stability',
      {},
      {
        pointerEngine,
      },
    );
    const snapshots: UsePointerResult[] = [];

    function PointerConsumer(): ReactNode {
      const pointer = usePointer();
      snapshots.push(pointer);
      return createElement('div', {
        id: 'pointer-stability-board',
        ref: pointer.ref,
      });
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'pointer-stability',
        },
        createElement(PointerConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'pointer-stability',
        },
        createElement(PointerConsumer),
      ),
    );

    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(snapshots[1]?.activate).toBe(snapshots[0]?.activate);
    expect(snapshots[1]?.deactivate).toBe(snapshots[0]?.deactivate);
    expect(snapshots[1]?.render).toBe(snapshots[0]?.render);

    await harness.unmount();
  });

  it('throws a typed error when usePointer() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      usePointer();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('RoomfulProvider');
  });
});

describe('useLocks', () => {
  it('exposes held locks and forwards the engine controls', async () => {
    const lockEngine = createMockLockEngine();
    lockEngine.setHolder('cell-1', createPeer('owner-peer'));
    createMockRoom(
      'locks-room',
      {},
      {
        lockEngine,
      },
    );
    let observed: UseLocksResult | null = null;

    function LocksConsumer(): ReactNode {
      observed = useLocks();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'locks-room',
        },
        createElement(LocksConsumer),
      ),
    );

    expect(observed?.locks).toEqual([expect.objectContaining({ key: 'cell-1' })]);
    expect(observed?.isLocked('cell-1')).toBe(true);
    expect(observed?.getHolder('cell-1')?.id).toBe('owner-peer');

    await observed?.acquire('cell-2');
    observed?.release('cell-1');
    observed?.releaseAll();

    expect(lockEngine.acquire).toHaveBeenCalledWith('cell-2', undefined);
    expect(lockEngine.release).toHaveBeenCalledWith('cell-1');
    expect(lockEngine.releaseAll).toHaveBeenCalledTimes(1);

    await harness.unmount();
    expect(lockEngine.allSubscriberCount()).toBe(0);
  });

  it('rerenders when lock states change and skips deep-equal updates', async () => {
    const lockEngine = createMockLockEngine();
    createMockRoom(
      'locks-reactivity',
      {},
      {
        lockEngine,
      },
    );
    const snapshots: LockState[][] = [];
    let renderCount = 0;

    function LocksConsumer(): ReactNode {
      const locks = useLocks();
      renderCount += 1;
      snapshots.push(locks.locks);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'locks-reactivity',
        },
        createElement(LocksConsumer),
      ),
    );

    const baseRenderCount = renderCount;
    const held = [createLock('cell-1', createPeer('owner-peer'))];

    await act(async () => {
      lockEngine.emitAll(held);
    });
    // Re-emit an equal snapshot: the render bail-out must skip it.
    await act(async () => {
      lockEngine.emitAll([createLock('cell-1', createPeer('owner-peer'))]);
    });

    expect(renderCount).toBe(baseRenderCount + 1);
    expect(snapshots.at(-1)?.[0]).toMatchObject({ key: 'cell-1' });
    expect(lockEngine.allSubscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('throws a typed error when useLocks() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useLocks();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
  });
});

describe('useActivity', () => {
  it('exposes the activity feed newest-first and forwards record', async () => {
    const activityEngine = createMockActivityEngine();
    activityEngine.seed({
      id: 'e1',
      type: 'seed',
      actor: createPeer('owner-peer'),
      timestamp: 1,
    });
    createMockRoom('activity-room', {}, { activityEngine });
    let observed: UseActivityResult | null = null;

    function ActivityConsumer(): ReactNode {
      observed = useActivity();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'activity-room',
        },
        createElement(ActivityConsumer),
      ),
    );

    expect(observed?.entries).toEqual([expect.objectContaining({ id: 'e1', type: 'seed' })]);

    observed?.record('comment:added', { n: 1 });
    expect(activityEngine.record).toHaveBeenCalledWith('comment:added', { n: 1 });

    await harness.unmount();
  });
});

describe('useSessionSummarizer', () => {
  it('summarizes the activity feed and recomputes on change', async () => {
    const activityEngine = createMockActivityEngine();
    activityEngine.seed({
      id: 's1',
      type: 'stroke',
      actor: createPeer('owner-peer'),
      timestamp: 1000,
    });
    createMockRoom('summary-room', {}, { activityEngine });
    let observed: ReturnType<typeof useSessionSummarizer> | null = null;

    function SummaryConsumer(): ReactNode {
      observed = useSessionSummarizer();
      return null;
    }

    const harness = await renderElement(
      createElement(RoomfulProvider, { roomId: 'summary-room' }, createElement(SummaryConsumer)),
    );

    expect(observed?.eventCount).toBe(1);
    expect(observed?.participants.map((participant) => participant.peer.id)).toEqual([
      'owner-peer',
    ]);

    await act(async () => {
      activityEngine.seed({
        id: 's2',
        type: 'stroke',
        actor: createPeer('owner-peer'),
        timestamp: 2000,
      });
    });

    expect(observed?.eventCount).toBe(2);
    expect(observed?.actionCounts).toEqual({ stroke: 2 });

    await harness.unmount();
  });
});

describe('useAgentApprovals', () => {
  it('exposes proposals + pending, forwards decisions, and reflects remote changes', async () => {
    const agentApprovalEngine = createMockAgentApprovalEngine();
    agentApprovalEngine.seed({
      id: 'p1',
      proposer: createPeer('bot-peer'),
      type: 'clear-canvas',
      status: 'pending',
      timestamp: 1,
    });
    createMockRoom('approvals-room', {}, { agentApprovalEngine });
    let observed: UseAgentApprovalsResult | null = null;

    function ApprovalsConsumer(): ReactNode {
      observed = useAgentApprovals();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'approvals-room',
        },
        createElement(ApprovalsConsumer),
      ),
    );

    expect(observed?.proposals).toEqual([
      expect.objectContaining({ id: 'p1', type: 'clear-canvas', status: 'pending' }),
    ]);
    expect(observed?.pending.map((proposal) => proposal.id)).toEqual(['p1']);

    await act(async () => {
      observed?.approve('p1');
    });
    expect(agentApprovalEngine.approve).toHaveBeenCalledWith('p1');

    // The decision propagates: the proposal is no longer pending.
    expect(observed?.pending).toEqual([]);
    expect(observed?.proposals[0]?.status).toBe('approved');

    // A remote proposal re-renders the list.
    await act(async () => {
      agentApprovalEngine.seed({
        id: 'p2',
        proposer: createPeer('bot-peer'),
        type: 'set-title',
        status: 'pending',
        timestamp: 2,
      });
    });

    expect(observed?.pending.map((proposal) => proposal.id)).toEqual(['p2']);

    observed?.reject('p2');
    expect(agentApprovalEngine.reject).toHaveBeenCalledWith('p2');

    await harness.unmount();
  });
});

describe('useFieldPresence', () => {
  it('exposes active fields, forwards setActiveField, and reflects remote changes', async () => {
    const fieldPresenceEngine = createMockFieldPresenceEngine([
      { fieldId: 'email', peers: [createPeer('peer-a')] },
    ]);
    createMockRoom('field-room', {}, { fieldPresenceEngine });
    let observed: UseFieldPresenceResult | null = null;

    function FieldPresenceConsumer(): ReactNode {
      observed = useFieldPresence();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'field-room',
        },
        createElement(FieldPresenceConsumer),
      ),
    );

    expect(observed?.fields).toEqual([expect.objectContaining({ fieldId: 'email' })]);
    expect(observed?.getFieldPeers('email').map((peer) => peer.id)).toEqual(['peer-a']);
    expect(observed?.getFieldPeers('missing')).toEqual([]);

    observed?.setActiveField('name');
    expect(fieldPresenceEngine.setActiveField).toHaveBeenCalledWith('name');

    await act(async () => {
      fieldPresenceEngine.emit([
        { fieldId: 'email', peers: [createPeer('peer-a')] },
        { fieldId: 'name', peers: [createPeer('peer-b')] },
      ]);
    });

    expect(observed?.fields.map((field) => field.fieldId)).toEqual(['email', 'name']);
    expect(observed?.getFieldPeers('name').map((peer) => peer.id)).toEqual(['peer-b']);

    await harness.unmount();
  });
});

describe('useComments', () => {
  it('exposes threads and forwards add, reply, resolve, reopen, and filter controls', async () => {
    const commentsEngine = createMockCommentsEngine([
      createCommentThread('thread-1', { anchor: { elementId: 'cell-1' }, text: 'root' }),
    ]);
    createMockRoom(
      'comments-room',
      {},
      {
        commentsEngine,
      },
    );
    let observed: UseCommentsResult | null = null;

    function CommentsConsumer(): ReactNode {
      observed = useComments();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'comments-room',
        },
        createElement(CommentsConsumer),
      ),
    );

    expect(observed?.threads).toEqual([expect.objectContaining({ id: 'thread-1' })]);
    expect(observed?.getByElement('cell-1')).toHaveLength(1);
    expect(observed?.getOpen()).toHaveLength(1);

    await act(async () => {
      await observed?.add({ anchor: { x: 1, y: 2 }, text: 'second' });
    });
    await observed?.reply('thread-1', 'a reply');
    await observed?.resolve('thread-1');
    await observed?.reopen('thread-1');

    expect(commentsEngine.add).toHaveBeenCalledWith({ anchor: { x: 1, y: 2 }, text: 'second' });
    expect(commentsEngine.reply).toHaveBeenCalledWith('thread-1', 'a reply');
    expect(commentsEngine.resolve).toHaveBeenCalledWith('thread-1');
    expect(commentsEngine.reopen).toHaveBeenCalledWith('thread-1');

    // The add propagated reactively into the threads snapshot.
    expect(observed?.threads).toHaveLength(2);

    await harness.unmount();
    expect(commentsEngine.subscriberCount()).toBe(0);
  });

  it('rerenders when threads change and skips deep-equal updates', async () => {
    const commentsEngine = createMockCommentsEngine();
    createMockRoom(
      'comments-reactivity',
      {},
      {
        commentsEngine,
      },
    );
    const snapshots: CommentThread[][] = [];
    let renderCount = 0;

    function CommentsConsumer(): ReactNode {
      const comments = useComments();
      renderCount += 1;
      snapshots.push(comments.threads);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'comments-reactivity',
        },
        createElement(CommentsConsumer),
      ),
    );

    const baseRenderCount = renderCount;
    const threads = [createCommentThread('thread-1', { text: 'hello' })];

    await act(async () => {
      commentsEngine.emit(threads);
    });
    // Re-emit a deep-equal snapshot: the render bail-out must skip it.
    await act(async () => {
      commentsEngine.emit([createCommentThread('thread-1', { text: 'hello' })]);
    });

    expect(renderCount).toBe(baseRenderCount + 1);
    expect(snapshots.at(-1)?.[0]).toMatchObject({ id: 'thread-1', text: 'hello' });
    expect(commentsEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('throws a typed error when useComments() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useComments();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
  });
});

describe('useHistory', () => {
  it('exposes the timeline and forwards capture, transaction, undo, and redo controls', async () => {
    const historyEngine = createMockHistoryEngine([createTimelineEntry('entry-1')]);
    createMockRoom(
      'history-room',
      {},
      {
        historyEngine,
      },
    );
    let observed: UseHistoryResult | null = null;

    function HistoryConsumer(): ReactNode {
      observed = useHistory();
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'history-room',
        },
        createElement(HistoryConsumer),
      ),
    );

    expect(observed?.timeline).toEqual([expect.objectContaining({ id: 'entry-1' })]);
    expect(observed?.canUndo).toBe(false);
    expect(observed?.canRedo).toBe(false);

    observed?.capture('draw', 'Drew a circle');
    const wrapped = vi.fn();
    await act(async () => {
      observed?.transaction('add-shape', wrapped);
    });
    await act(async () => {
      await observed?.undo();
    });
    await act(async () => {
      await observed?.redo();
    });

    expect(historyEngine.capture).toHaveBeenCalledWith('draw', 'Drew a circle');
    expect(historyEngine.transaction).toHaveBeenCalledWith('add-shape', wrapped);
    expect(wrapped).toHaveBeenCalledTimes(1);
    expect(historyEngine.undo).toHaveBeenCalledTimes(1);
    expect(historyEngine.redo).toHaveBeenCalledTimes(1);

    // The capture and transaction propagated reactively into the timeline snapshot.
    expect(observed?.timeline).toHaveLength(3);
    // redo() was the last control invoked, leaving an undoable entry available.
    expect(observed?.canUndo).toBe(true);
    expect(observed?.canRedo).toBe(false);

    await harness.unmount();
    expect(historyEngine.subscriberCount()).toBe(0);
  });

  it('rerenders when the timeline changes and skips deep-equal updates', async () => {
    const historyEngine = createMockHistoryEngine();
    createMockRoom(
      'history-reactivity',
      {},
      {
        historyEngine,
      },
    );
    const snapshots: TimelineEntry[][] = [];
    let renderCount = 0;

    function HistoryConsumer(): ReactNode {
      const history = useHistory();
      renderCount += 1;
      snapshots.push(history.timeline);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'history-reactivity',
        },
        createElement(HistoryConsumer),
      ),
    );

    const baseRenderCount = renderCount;
    const timeline = [createTimelineEntry('entry-1', { action: 'draw' })];

    await act(async () => {
      historyEngine.emit(timeline);
    });
    // Re-emit a deep-equal snapshot: the render bail-out must skip it.
    await act(async () => {
      historyEngine.emit([createTimelineEntry('entry-1', { action: 'draw' })]);
    });

    expect(renderCount).toBe(baseRenderCount + 1);
    expect(snapshots.at(-1)?.[0]).toMatchObject({ id: 'entry-1', action: 'draw' });
    expect(historyEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('rerenders when canUndo or canRedo changes without a timeline change', async () => {
    const historyEngine = createMockHistoryEngine();
    createMockRoom(
      'history-availability',
      {},
      {
        historyEngine,
      },
    );
    let observed: UseHistoryResult | null = null;
    let renderCount = 0;

    function HistoryConsumer(): ReactNode {
      observed = useHistory();
      renderCount += 1;
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'history-availability',
        },
        createElement(HistoryConsumer),
      ),
    );

    const baseRenderCount = renderCount;
    expect(observed?.canUndo).toBe(false);

    await act(async () => {
      historyEngine.setCanUndo(true);
    });

    expect(observed?.canUndo).toBe(true);
    expect(renderCount).toBe(baseRenderCount + 1);

    await harness.unmount();
  });

  it('throws a typed error when useHistory() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useHistory();
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
  });
});

describe('useLockState', () => {
  it('tracks a single key and transitions from free to held to free', async () => {
    const lockEngine = createMockLockEngine();
    createMockRoom(
      'lock-state-room',
      {},
      {
        lockEngine,
      },
    );
    const observed: Array<LockState | null> = [];

    function LockStateConsumer(): ReactNode {
      const state = useLockState('cell-1');
      observed.push(state);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'lock-state-room',
        },
        createElement(LockStateConsumer),
      ),
    );

    // Initially free.
    expect(observed.at(-1)).toBeNull();

    await act(async () => {
      lockEngine.emitKey('cell-1', createLock('cell-1', createPeer('owner-peer')));
    });
    expect(observed.at(-1)).toMatchObject({ key: 'cell-1', holder: { id: 'owner-peer' } });

    await act(async () => {
      lockEngine.emitKey('cell-1', createLock('cell-1', null));
    });
    expect(observed.at(-1)).toBeNull();

    expect(lockEngine.keySubscriberCount('cell-1')).toBe(1);

    await harness.unmount();
    expect(lockEngine.keySubscriberCount('cell-1')).toBe(0);
  });

  it('throws a typed error when useLockState() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useLockState('cell-1');
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
  });
});

describe('useSharedState', () => {
  it('returns [value, setValue], forwards options, and supports direct and updater writes', async () => {
    const stateEngine = createMockStateEngine({
      count: 0,
      nested: {
        enabled: true,
      },
    });
    const room = createMockRoom(
      'shared-state-room',
      {},
      {
        stateEngine,
      },
    );
    let observedValue: {
      count: number;
      nested: {
        enabled: boolean;
      };
    } | null = null;
    let observedSetValue: Dispatch<
      SetStateAction<{
        count: number;
        nested: {
          enabled: boolean;
        };
      }>
    > | null = null;
    const setterReferences: Array<
      Dispatch<SetStateAction<{ count: number; nested: { enabled: boolean } }>>
    > = [];

    function SharedStateConsumer(): null {
      const [value, setValue] = useSharedState('shared-count', {
        initialValue: {
          count: 0,
          nested: {
            enabled: true,
          },
        },
        strategy: 'crdt',
        persist: false,
      });

      observedValue = value;
      observedSetValue = setValue;
      setterReferences.push(setValue);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-room',
        },
        createElement(SharedStateConsumer),
      ),
    );

    expect(observedValue).toEqual({
      count: 0,
      nested: {
        enabled: true,
      },
    });
    expect(typeof observedSetValue).toBe('function');
    expect(room.useState.mock.calls[0]?.[0]).toEqual({
      initialValue: {
        count: 0,
        nested: {
          enabled: true,
        },
      },
      strategy: 'crdt',
      persist: false,
    });

    await act(async () => {
      observedSetValue?.({
        count: 3,
        nested: {
          enabled: false,
        },
      });
    });

    expect(stateEngine.set).toHaveBeenCalledWith({
      count: 3,
      nested: {
        enabled: false,
      },
    });

    await act(async () => {
      observedSetValue?.((previous) => {
        return {
          count: previous.count + 2,
          nested: previous.nested,
        };
      });
    });

    expect(stateEngine.set).toHaveBeenLastCalledWith({
      count: 5,
      nested: {
        enabled: false,
      },
    });

    const setCallCountBeforeNoop = stateEngine.set.mock.calls.length;
    await act(async () => {
      observedSetValue?.((previous) => {
        return {
          count: previous.count,
          nested: {
            enabled: previous.nested.enabled,
          },
        };
      });
    });

    expect(stateEngine.set).toHaveBeenCalledTimes(setCallCountBeforeNoop);

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-room',
        },
        createElement(SharedStateConsumer),
      ),
    );

    expect(setterReferences.length).toBeGreaterThanOrEqual(2);
    expect(
      setterReferences.every((setValueReference) => {
        return setValueReference === setterReferences[0];
      }),
    ).toBe(true);

    await harness.unmount();
  });

  it('rerenders on local or remote state changes and skips deep-equal snapshots', async () => {
    const stateEngine = createMockStateEngine({
      votes: {
        yes: 1,
        no: 0,
      },
    });
    createMockRoom(
      'shared-state-reactivity',
      {},
      {
        stateEngine,
      },
    );
    const snapshots: Array<{ votes: { yes: number; no: number } }> = [];
    let renderCount = 0;
    let observedSetValue: Dispatch<
      SetStateAction<{
        votes: {
          yes: number;
          no: number;
        };
      }>
    > | null = null;

    function SharedStateConsumer(): null {
      const [value, setValue] = useSharedState('poll-state', {
        initialValue: {
          votes: {
            yes: 1,
            no: 0,
          },
        },
      });

      renderCount += 1;
      snapshots.push(value);
      observedSetValue = setValue;
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-reactivity',
        },
        createElement(SharedStateConsumer),
      ),
    );

    await act(async () => {
      observedSetValue?.((previous) => {
        return {
          votes: {
            yes: previous.votes.yes + 1,
            no: previous.votes.no,
          },
        };
      });
    });

    await act(async () => {
      stateEngine.emit({
        votes: {
          yes: 2,
          no: 0,
        },
      });
    });

    await act(async () => {
      stateEngine.emit({
        votes: {
          yes: 2,
          no: 1,
        },
      });
    });

    expect(renderCount).toBe(3);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]).toEqual({
      votes: {
        yes: 2,
        no: 0,
      },
    });
    expect(snapshots[2]).toEqual({
      votes: {
        yes: 2,
        no: 1,
      },
    });

    await harness.unmount();
  });

  it('preserves the shared value reference across parent rerenders when unchanged', async () => {
    const stateEngine = createMockStateEngine({
      count: 1,
      meta: {
        owner: 'Ada',
      },
    });
    createMockRoom(
      'shared-state-stability',
      {},
      {
        stateEngine,
      },
    );
    const valueReferences: Array<{ count: number; meta: { owner: string } }> = [];

    function SharedStateConsumer(): null {
      const [value] = useSharedState('stable-state', {
        initialValue: {
          count: 1,
          meta: {
            owner: 'Ada',
          },
        },
      });

      valueReferences.push(value);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-stability',
        },
        createElement(SharedStateConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-stability',
        },
        createElement(SharedStateConsumer),
      ),
    );

    expect(valueReferences).toHaveLength(2);
    expect(valueReferences[1]).toBe(valueReferences[0]);
    expect(stateEngine.subscriberCount()).toBe(1);

    await harness.unmount();
  });

  it('allows multiple consumers in the same room when key and options are compatible', async () => {
    const stateEngine = createMockStateEngine({
      score: 1,
    });
    createMockRoom(
      'shared-state-multi',
      {},
      {
        stateEngine,
      },
    );
    const firstSnapshots: Array<{ score: number }> = [];
    const secondSnapshots: Array<{ score: number }> = [];
    let firstSetValue: Dispatch<SetStateAction<{ score: number }>> | null = null;

    function FirstConsumer(): null {
      const [value, setValue] = useSharedState('game-state', {
        initialValue: {
          score: 1,
        },
        strategy: 'lww',
      });

      firstSnapshots.push(value);
      firstSetValue = setValue;
      return null;
    }

    function SecondConsumer(): null {
      const [value] = useSharedState('game-state', {
        initialValue: {
          score: 1,
        },
      });

      secondSnapshots.push(value);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-multi',
        },
        createElement(FirstConsumer),
        createElement(SecondConsumer),
      ),
    );

    await act(async () => {
      firstSetValue?.({
        score: 2,
      });
    });

    expect(firstSnapshots).toEqual([{ score: 1 }, { score: 2 }]);
    expect(secondSnapshots).toEqual([{ score: 1 }, { score: 2 }]);

    await harness.unmount();
  });

  it('throws when the same room is bound to a different key', () => {
    createMockRoom('shared-state-key-mismatch');

    function FirstConsumer(): null {
      useSharedState('first-key', {
        initialValue: {
          count: 0,
        },
      });
      return null;
    }

    function SecondConsumer(): null {
      useSharedState('second-key', {
        initialValue: {
          count: 0,
        },
      });
      return null;
    }

    let thrownError: unknown = null;

    try {
      renderToString(
        createElement(
          RoomfulProvider,
          {
            roomId: 'shared-state-key-mismatch',
          },
          createElement(FirstConsumer),
          createElement(SecondConsumer),
        ),
      );
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(RoomfulError);
    expect((thrownError as Error).message).toContain('already bound to key');
  });

  it('throws when the same room receives incompatible shared state options', () => {
    createMockRoom('shared-state-option-mismatch');

    function InitialValueConsumer(): null {
      useSharedState('state-key', {
        initialValue: {
          count: 0,
        },
        strategy: 'lww',
      });
      return null;
    }

    function ConflictingInitialValueConsumer(): null {
      useSharedState('state-key', {
        initialValue: {
          count: 1,
        },
      });
      return null;
    }

    expect(() => {
      renderToString(
        createElement(
          RoomfulProvider,
          {
            roomId: 'shared-state-option-mismatch',
          },
          createElement(InitialValueConsumer),
          createElement(ConflictingInitialValueConsumer),
        ),
      );
    }).toThrow('different initialValue');

    createMockRoom('shared-state-persist-mismatch');

    function PersistentConsumer(): null {
      useSharedState('state-key', {
        initialValue: {
          count: 0,
        },
        persist: true,
      });
      return null;
    }

    function NonPersistentConsumer(): null {
      useSharedState('state-key', {
        initialValue: {
          count: 0,
        },
        persist: false,
      });
      return null;
    }

    expect(() => {
      renderToString(
        createElement(
          RoomfulProvider,
          {
            roomId: 'shared-state-persist-mismatch',
          },
          createElement(PersistentConsumer),
          createElement(NonPersistentConsumer),
        ),
      );
    }).toThrow('persistence is already enabled');
  });

  it('allows later persist: true upgrades for lww state in the same room', async () => {
    const stateEngine = createMockStateEngine({
      count: 0,
    });
    const room = createMockRoom(
      'shared-state-persist-upgrade',
      {},
      {
        stateEngine,
      },
    );

    function InitialConsumer(): null {
      useSharedState('persisted-state', {
        initialValue: {
          count: 0,
        },
      });
      return null;
    }

    function UpgradedConsumer(): null {
      useSharedState('persisted-state', {
        initialValue: {
          count: 0,
        },
        persist: true,
      });
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-persist-upgrade',
        },
        createElement(InitialConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-persist-upgrade',
        },
        createElement(InitialConsumer),
        createElement(UpgradedConsumer),
      ),
    );

    expect(room.useState.mock.calls).toHaveLength(3);

    await harness.unmount();
  });

  it('keeps setValue stable across room replacement and resubscribes to the new state engine', async () => {
    const roomAState = createMockStateEngine({
      count: 1,
    });
    const roomBState = createMockStateEngine({
      count: 10,
    });
    createMockRoom(
      'shared-state-room-a',
      {},
      {
        stateEngine: roomAState,
      },
    );
    createMockRoom(
      'shared-state-room-b',
      {},
      {
        stateEngine: roomBState,
      },
    );
    const snapshots: Array<{ count: number }> = [];
    const setters: Array<Dispatch<SetStateAction<{ count: number }>>> = [];

    function SharedStateConsumer(): null {
      const [value, setValue] = useSharedState('room-state', {
        initialValue: {
          count: 0,
        },
      });

      snapshots.push(value);
      setters.push(setValue);
      return null;
    }

    const harness = await renderElement(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-room-a',
        },
        createElement(SharedStateConsumer),
      ),
    );

    await harness.rerender(
      createElement(
        RoomfulProvider,
        {
          roomId: 'shared-state-room-b',
        },
        createElement(SharedStateConsumer),
      ),
    );

    const snapshotCountAfterReplacement = snapshots.length;

    await act(async () => {
      roomAState.emit({
        count: 99,
      });
    });
    await act(async () => {
      roomBState.emit({
        count: 11,
      });
    });
    await act(async () => {
      setters[1]?.((previous) => {
        return {
          count: previous.count + 1,
        };
      });
    });

    expect(snapshotCountAfterReplacement).toBe(2);
    expect(snapshots).toEqual([{ count: 1 }, { count: 10 }, { count: 11 }, { count: 12 }]);
    expect(roomAState.subscriberCount()).toBe(0);
    expect(roomBState.subscriberCount()).toBe(1);
    expect(setters[1]).toBe(setters[0]);
    expect(roomAState.set).toHaveBeenCalledTimes(0);
    expect(roomBState.set).toHaveBeenCalledWith({
      count: 12,
    });

    await harness.unmount();
  });

  it('preserves state value and setter types', () => {
    function TypeConsumer(): null {
      const [value, setValue] = useSharedState('typed-state', {
        initialValue: {
          count: 0,
          label: 'Ada',
        },
      });

      expectTypeOf(value).toEqualTypeOf<{
        count: number;
        label: string;
      }>();
      expectTypeOf(setValue).toEqualTypeOf<
        Dispatch<
          SetStateAction<{
            count: number;
            label: string;
          }>
        >
      >();

      return null;
    }

    expect(TypeConsumer).toBeTypeOf('function');
  });

  it('throws a typed error when useSharedState() is called outside the provider', () => {
    function MissingProviderConsumer(): null {
      useSharedState('outside-provider', {
        initialValue: {
          count: 0,
        },
      });
      return null;
    }

    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrowError(RoomfulError);
    expect(() => {
      renderToString(createElement(MissingProviderConsumer));
    }).toThrow('RoomfulProvider');
  });
});
