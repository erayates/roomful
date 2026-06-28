import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';
import type { Unsubscribe, ViewportState } from '../types';
import { createViewportEngine, type ViewportBroadcastMode, type ViewportFrame } from './viewport';

interface ScrollRectInit {
  scrollWidth?: number;
  scrollHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
}

type Listener = () => void;

class MockScrollElement {
  public scrollLeft = 0;

  public scrollTop = 0;

  public scrollWidth = 1_000;

  public scrollHeight = 1_000;

  public clientWidth = 200;

  public clientHeight = 200;

  public readonly ownerDocument = { activeElement: null } as unknown as Document;

  public readonly scrollToCalls: Array<{ left: number; top: number }> = [];

  private readonly listeners = new Map<string, Set<Listener>>();

  public configure(rect: ScrollRectInit): void {
    Object.assign(this, rect);
  }

  public addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  public removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  public scrollTo(options: { left: number; top: number }): void {
    this.scrollLeft = options.left;
    this.scrollTop = options.top;
    this.scrollToCalls.push({ left: options.left, top: options.top });
  }

  public emitScroll(): void {
    for (const listener of this.listeners.get('scroll') ?? []) {
      listener();
    }
  }
}

interface MockContextHandle {
  broadcasts: Array<{ frame: ViewportFrame; mode: ViewportBroadcastMode }>;
  stops: number;
  setStates(states: ViewportState[]): void;
  setPresentingPeerId(peerId: string | null): void;
  emit(): void;
  context: Parameters<typeof createViewportEngine>[0];
}

function createMockContext(): MockContextHandle {
  let states: ViewportState[] = [];
  let presentingPeerId: string | null = null;
  const subscribers = new Set<(states: ViewportState[]) => void>();
  const broadcasts: Array<{ frame: ViewportFrame; mode: ViewportBroadcastMode }> = [];
  let stops = 0;

  return {
    broadcasts,
    get stops() {
      return stops;
    },
    setStates(next) {
      states = next;
    },
    setPresentingPeerId(peerId) {
      presentingPeerId = peerId;
    },
    emit() {
      for (const subscriber of subscribers) {
        subscriber(states);
      }
    },
    context: {
      broadcastViewport(frame, mode) {
        broadcasts.push({ frame, mode });
      },
      stopViewport() {
        stops += 1;
      },
      getStates() {
        return states;
      },
      subscribe(callback): Unsubscribe {
        subscribers.add(callback);
        callback(states);
        return () => {
          subscribers.delete(callback);
        };
      },
      getPresentingPeerId() {
        return presentingPeerId;
      },
    },
  };
}

function createRemoteViewport(overrides: Partial<ViewportState> = {}): ViewportState {
  return {
    peerId: 'peer-a',
    scrollX: 0.5,
    scrollY: 0.5,
    zoom: 1,
    viewportWidth: 200,
    viewportHeight: 200,
    focusedElement: null,
    ...overrides,
  };
}

interface TestPresence {
  name: string;
}

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createViewportEngine', () => {
  it('measures normalized scroll and dimensions and broadcasts while active', () => {
    const handle = createMockContext();
    const element = new MockScrollElement();
    element.configure({
      scrollWidth: 1_000,
      scrollHeight: 600,
      clientWidth: 200,
      clientHeight: 200,
    });
    element.scrollLeft = 400; // 400 / (1000 - 200) = 0.5
    element.scrollTop = 100; // 100 / (600 - 200) = 0.25

    const engine = createViewportEngine(handle.context, { throttleMs: 0 });
    engine.mount(element as unknown as HTMLElement);

    expect(element.listenerCount('scroll')).toBe(1);
    expect(handle.broadcasts).toHaveLength(0);

    engine.broadcast();

    expect(handle.broadcasts).toHaveLength(1);
    expect(handle.broadcasts[0]?.mode).toBe('broadcast');
    expect(handle.broadcasts[0]?.frame).toMatchObject({
      scrollX: 0.5,
      scrollY: 0.25,
      zoom: 1,
      viewportWidth: 200,
      viewportHeight: 200,
      focusedElement: null,
    });

    element.scrollLeft = 600; // 600 / (1000 - 200) = 0.75
    element.emitScroll();

    expect(handle.broadcasts).toHaveLength(2);
    expect(handle.broadcasts[1]?.frame.scrollX).toBe(0.75);

    engine.unmount();
    expect(element.listenerCount('scroll')).toBe(0);
  });

  it('does not broadcast scroll changes until broadcasting starts and stops cleanly', () => {
    const handle = createMockContext();
    const element = new MockScrollElement();

    const engine = createViewportEngine(handle.context, { throttleMs: 0 });
    engine.mount(element as unknown as HTMLElement);

    element.scrollTop = 500;
    element.emitScroll();
    expect(handle.broadcasts).toHaveLength(0);

    engine.broadcast();
    expect(handle.broadcasts).toHaveLength(1);

    engine.stopBroadcast();
    expect(handle.stops).toBe(1);

    element.scrollTop = 250;
    element.emitScroll();
    expect(handle.broadcasts).toHaveLength(1);
  });

  it('throttles rapid scroll updates and flushes a trailing frame', async () => {
    vi.useFakeTimers();
    const handle = createMockContext();
    const element = new MockScrollElement();
    element.configure({ scrollWidth: 1_200, clientWidth: 200 }); // maxScrollX = 1000

    const engine = createViewportEngine(handle.context, { throttleMs: 50 });
    engine.mount(element as unknown as HTMLElement);
    engine.broadcast();
    expect(handle.broadcasts).toHaveLength(1);

    element.scrollLeft = 100;
    element.emitScroll();
    element.scrollLeft = 800;
    element.emitScroll();
    expect(handle.broadcasts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(handle.broadcasts).toHaveLength(2);
    expect(handle.broadcasts[1]?.frame.scrollX).toBe(0.8); // 800 / (1200 - 200)

    engine.unmount();
  });

  it('applies a followed peer scroll to the mounted element via scrollTo', () => {
    const handle = createMockContext();
    const element = new MockScrollElement();
    element.configure({
      scrollWidth: 1_000,
      scrollHeight: 1_000,
      clientWidth: 200,
      clientHeight: 200,
    });
    handle.setStates([createRemoteViewport({ peerId: 'peer-a', scrollX: 0.5, scrollY: 0.25 })]);

    const engine = createViewportEngine(handle.context, { throttleMs: 0 });
    engine.mount(element as unknown as HTMLElement);
    engine.follow('peer-a');

    // 0.5 * (1000 - 200) = 400, 0.25 * 800 = 200
    expect(element.scrollToCalls.at(-1)).toEqual({ left: 400, top: 200 });

    handle.setStates([createRemoteViewport({ peerId: 'peer-a', scrollX: 1, scrollY: 1 })]);
    handle.emit();
    expect(element.scrollToCalls.at(-1)).toEqual({ left: 800, top: 800 });
  });

  it('does not echo a frame back out while applying a followed scroll', () => {
    const handle = createMockContext();
    const element = new MockScrollElement();
    handle.setStates([createRemoteViewport({ peerId: 'peer-a', scrollY: 0.5 })]);

    const engine = createViewportEngine(handle.context, { throttleMs: 0 });
    engine.mount(element as unknown as HTMLElement);
    engine.broadcast();
    const broadcastsAfterStart = handle.broadcasts.length;

    engine.follow('peer-a');
    handle.emit();

    // Applying the remote scroll must not have produced another outbound frame.
    expect(handle.broadcasts).toHaveLength(broadcastsAfterStart);
  });

  it('follows the presenting peer reported by the room and unfollow stops applying', () => {
    const handle = createMockContext();
    const element = new MockScrollElement();
    element.configure({ scrollHeight: 1_000, clientHeight: 200 });
    handle.setStates([createRemoteViewport({ peerId: 'presenter', scrollX: 0, scrollY: 0.5 })]);
    handle.setPresentingPeerId('presenter');

    const engine = createViewportEngine(handle.context, { throttleMs: 0 });
    engine.mount(element as unknown as HTMLElement);
    handle.emit();

    expect(element.scrollToCalls.at(-1)).toEqual({ left: 0, top: 400 });

    const callsBeforeUnfollow = element.scrollToCalls.length;
    handle.setPresentingPeerId(null);
    engine.unfollow();
    handle.setStates([createRemoteViewport({ peerId: 'presenter', scrollX: 0, scrollY: 1 })]);
    handle.emit();

    expect(element.scrollToCalls).toHaveLength(callsBeforeUnfollow);
  });

  it('defers the first frame until a late mount when broadcast precedes mount', () => {
    const handle = createMockContext();
    const element = new MockScrollElement();
    element.configure({ scrollHeight: 1_000, clientHeight: 200 });
    element.scrollTop = 400; // -> 0.5

    const engine = createViewportEngine(handle.context, { throttleMs: 0 });
    // broadcast() before mount() must not throw and must not emit yet.
    engine.broadcast();
    expect(handle.broadcasts).toHaveLength(0);

    engine.mount(element as unknown as HTMLElement);
    expect(handle.broadcasts).toHaveLength(1);
    expect(handle.broadcasts[0]?.frame.scrollY).toBe(0.5);

    engine.unmount();
  });

  it('applies a followed scroll via scrollLeft/scrollTop when scrollTo is unavailable', () => {
    const handle = createMockContext();
    const element = new MockScrollElement();
    element.configure({ scrollHeight: 1_000, clientHeight: 200 });
    // Remove scrollTo so the engine falls back to assigning scroll offsets.
    Reflect.set(element, 'scrollTo', undefined);
    handle.setStates([createRemoteViewport({ peerId: 'peer-a', scrollX: 0, scrollY: 0.5 })]);

    const engine = createViewportEngine(handle.context, { throttleMs: 0 });
    engine.mount(element as unknown as HTMLElement);
    engine.follow('peer-a');

    expect(element.scrollTop).toBe(400); // 0.5 * (1000 - 200)

    engine.unmount();
  });

  it('ignores stopBroadcast and unfollow when nothing is active', () => {
    const handle = createMockContext();
    const engine = createViewportEngine(handle.context, { throttleMs: 0 });

    engine.stopBroadcast();
    engine.unfollow();

    expect(handle.stops).toBe(0);
    expect(handle.broadcasts).toHaveLength(0);
  });

  it('exposes remote states through getAll, get, and subscribe', () => {
    const handle = createMockContext();
    const remote = createRemoteViewport({ peerId: 'peer-a' });
    handle.setStates([remote]);

    const engine = createViewportEngine(handle.context, { throttleMs: 0 });
    const seen = vi.fn();
    const unsubscribe = engine.subscribe(seen);

    expect(seen).toHaveBeenCalledWith([remote]);
    expect(engine.getAll()).toEqual([remote]);
    expect(engine.get('peer-a')).toEqual(remote);
    expect(engine.get('missing')).toBeUndefined();

    unsubscribe();
  });
});

describe('ViewportEngine room integration', () => {
  it('streams the local viewport to a remote peer via get and subscribe', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-viewport', {
      presence: { name: 'Alice' },
    });
    const roomB = harness.createRoom<TestPresence>('engine-viewport', {
      presence: { name: 'Bob' },
    });

    const viewportA = roomA.useViewport({ throttleMs: 0 });
    const viewportB = roomB.useViewport({ throttleMs: 0 });
    const onRemote = vi.fn();
    viewportB.subscribe(onRemote);
    expect(onRemote).toHaveBeenCalledWith([]);

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const elementA = new MockScrollElement();
    elementA.configure({ scrollWidth: 1_000, clientWidth: 200 }); // maxScrollX = 800
    elementA.scrollLeft = 400; // -> 0.5
    viewportA.mount(elementA as unknown as HTMLElement);
    viewportA.broadcast();

    await harness.waitFor(() => {
      return viewportB.get(roomA.peerId) !== undefined;
    });

    const received = viewportB.get(roomA.peerId);
    expect(received).toMatchObject({
      peerId: roomA.peerId,
      scrollX: 0.5,
      zoom: 1,
    });
    expect(viewportB.getAll()).toHaveLength(1);
    expect(onRemote).toHaveBeenLastCalledWith([expect.objectContaining({ peerId: roomA.peerId })]);

    viewportA.unmount();
  });

  it('applies a broadcasting peer viewport to a follower element', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-viewport-follow', {
      presence: { name: 'Alice' },
    });
    const roomB = harness.createRoom<TestPresence>('engine-viewport-follow', {
      presence: { name: 'Bob' },
    });

    const viewportA = roomA.useViewport({ throttleMs: 0 });
    const viewportB = roomB.useViewport({ throttleMs: 0 });

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const elementA = new MockScrollElement();
    elementA.configure({ scrollHeight: 1_000, clientHeight: 200 }); // maxScrollY = 800
    elementA.scrollTop = 600; // -> 0.75
    viewportA.mount(elementA as unknown as HTMLElement);

    const elementB = new MockScrollElement();
    elementB.configure({ scrollHeight: 2_000, clientHeight: 400 }); // maxScrollY = 1600
    viewportB.mount(elementB as unknown as HTMLElement);

    viewportA.broadcast();
    viewportB.follow(roomA.peerId);

    await harness.waitFor(() => elementB.scrollToCalls.length > 0);

    // 0.75 normalized -> 0.75 * 1600 = 1200 on the follower's own scrollable area.
    expect(elementB.scrollToCalls.at(-1)).toEqual({ left: 0, top: 1_200 });

    viewportA.unmount();
    viewportB.unmount();
  });

  it('forces peers to follow when a peer enters present mode', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-viewport-present', {
      presence: { name: 'Alice' },
    });
    const roomB = harness.createRoom<TestPresence>('engine-viewport-present', {
      presence: { name: 'Bob' },
    });

    const viewportA = roomA.useViewport({ throttleMs: 0 });
    const viewportB = roomB.useViewport({ throttleMs: 0 });

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const elementA = new MockScrollElement();
    elementA.configure({ scrollHeight: 1_000, clientHeight: 200 });
    elementA.scrollTop = 400; // -> 0.5
    viewportA.mount(elementA as unknown as HTMLElement);

    const elementB = new MockScrollElement();
    elementB.configure({ scrollHeight: 1_000, clientHeight: 200 });
    viewportB.mount(elementB as unknown as HTMLElement);

    // B never calls follow(); present() on A must force B to follow.
    viewportA.present();

    await harness.waitFor(() => elementB.scrollToCalls.length > 0);
    expect(elementB.scrollToCalls.at(-1)).toEqual({ left: 0, top: 400 });

    viewportA.stopPresenting();
    viewportA.unmount();
    viewportB.unmount();
  });

  it('drops a remote viewport when the peer disconnects', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-viewport-leave', {
      presence: { name: 'Alice' },
    });
    const roomB = harness.createRoom<TestPresence>('engine-viewport-leave', {
      presence: { name: 'Bob' },
    });

    const viewportA = roomA.useViewport({ throttleMs: 0 });
    const viewportB = roomB.useViewport({ throttleMs: 0 });

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const elementA = new MockScrollElement();
    viewportA.mount(elementA as unknown as HTMLElement);
    viewportA.broadcast();

    await harness.waitFor(() => viewportB.get(roomA.peerId) !== undefined);

    await roomA.disconnect();
    await harness.waitFor(() => viewportB.get(roomA.peerId) === undefined);

    expect(viewportB.getAll()).toEqual([]);

    viewportA.unmount();
  });
});
