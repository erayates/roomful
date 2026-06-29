import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';
import type { PointerBeam, Unsubscribe } from '../types';
import { createPointerEngine, type PointerFrame } from './pointer';

type Listener = (event: unknown) => void;

class MockElement {
  public readonly children: MockElement[] = [];

  public readonly style: Record<string, string> = {};

  public readonly attributes = new Map<string, string>();

  public parentNode: MockElement | null = null;

  public ownerDocument: MockDocument;

  public id = '';

  public constructor(
    ownerDocument: MockDocument,
    public readonly tagName: string,
  ) {
    this.ownerDocument = ownerDocument;
  }

  private rect = {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  };

  private readonly listeners = new Map<string, Set<Listener>>();

  public setBoundingRect(rect: { left: number; top: number; width: number; height: number }): void {
    this.rect = rect;
  }

  public getBoundingClientRect(): DOMRect {
    return {
      ...this.rect,
      bottom: this.rect.top + this.rect.height,
      right: this.rect.left + this.rect.width,
      x: this.rect.left,
      y: this.rect.top,
      toJSON() {
        return { ...this };
      },
    } as DOMRect;
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

  public dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  public appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  public removeChild(child: MockElement): MockElement {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }

    return child;
  }

  public contains(child: MockElement): boolean {
    if (this.children.includes(child)) {
      return true;
    }

    return this.children.some((candidate) => candidate.contains(child));
  }

  public remove(): void {
    this.parentNode?.removeChild(this);
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'id') {
      this.id = value;
    }
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

class MockDocument {
  public readonly body: MockElement;

  public constructor() {
    this.body = new MockElement(this, 'body');
  }

  public createElement(tagName: string): MockElement {
    return new MockElement(this, tagName);
  }
}

interface MockContextHandle {
  broadcasts: PointerFrame[];
  stops: number;
  setBeams(beams: PointerBeam[]): void;
  emit(): void;
  context: Parameters<typeof createPointerEngine>[0];
}

function createMockContext(): MockContextHandle {
  let beams: PointerBeam[] = [];
  const subscribers = new Set<(beams: PointerBeam[]) => void>();
  const broadcasts: PointerFrame[] = [];
  let stops = 0;

  return {
    broadcasts,
    get stops() {
      return stops;
    },
    setBeams(next) {
      beams = next;
    },
    emit() {
      for (const subscriber of subscribers) {
        subscriber(beams);
      }
    },
    context: {
      broadcastPointer(frame) {
        broadcasts.push(frame);
      },
      stopPointer() {
        stops += 1;
      },
      getBeams() {
        return beams;
      },
      subscribe(callback): Unsubscribe {
        subscribers.add(callback);
        callback(beams);
        return () => {
          subscribers.delete(callback);
        };
      },
    },
  };
}

function createRemoteBeam(overrides: Partial<PointerBeam> = {}): PointerBeam {
  return {
    peerId: 'peer-a',
    name: 'Alice',
    color: '#22c55e',
    x: 0.25,
    y: 0.75,
    active: true,
    ...overrides,
  };
}

interface TestPresence {
  name: string;
  color: string;
}

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createPointerEngine', () => {
  it('tracks mousemove and broadcasts a normalized position only while active', () => {
    const handle = createMockContext();
    const doc = new MockDocument();
    const board = doc.createElement('div');
    board.setBoundingRect({ left: 10, top: 20, width: 200, height: 100 });

    const engine = createPointerEngine(handle.context, { throttleMs: 0 });
    engine.mount(board as unknown as HTMLElement);
    expect(board.listenerCount('mousemove')).toBe(1);

    // Movement before activate() must not broadcast.
    board.dispatch('mousemove', { clientX: 110, clientY: 70 });
    expect(handle.broadcasts).toHaveLength(0);

    engine.activate();
    board.dispatch('mousemove', { clientX: 110, clientY: 70 });

    expect(handle.broadcasts).toHaveLength(1);
    expect(handle.broadcasts[0]).toEqual({ x: 0.5, y: 0.5 });

    // A non-pointer event is ignored.
    board.dispatch('mousemove', null);
    expect(handle.broadcasts).toHaveLength(1);

    engine.unmount();
    expect(board.listenerCount('mousemove')).toBe(0);
  });

  it('clamps positions outside the container to the 0-1 range', () => {
    const handle = createMockContext();
    const doc = new MockDocument();
    const board = doc.createElement('div');
    board.setBoundingRect({ left: 0, top: 0, width: 100, height: 100 });

    const engine = createPointerEngine(handle.context, { throttleMs: 0 });
    engine.mount(board as unknown as HTMLElement);
    engine.activate();

    board.dispatch('mousemove', { clientX: 1_000, clientY: -50 });
    expect(handle.broadcasts.at(-1)).toEqual({ x: 1, y: 0 });
  });

  it('broadcasts inactive (stops) on deactivate and ignores a redundant deactivate', () => {
    const handle = createMockContext();
    const doc = new MockDocument();
    const board = doc.createElement('div');

    const engine = createPointerEngine(handle.context, { throttleMs: 0 });
    engine.mount(board as unknown as HTMLElement);
    engine.activate();
    board.dispatch('mousemove', { clientX: 10, clientY: 10 });
    expect(handle.broadcasts).toHaveLength(1);

    engine.deactivate();
    expect(handle.stops).toBe(1);

    // After deactivate, movement no longer broadcasts.
    board.dispatch('mousemove', { clientX: 50, clientY: 50 });
    expect(handle.broadcasts).toHaveLength(1);

    // A redundant deactivate is a no-op.
    engine.deactivate();
    expect(handle.stops).toBe(1);
  });

  it('throttles rapid movement and flushes the trailing frame', async () => {
    vi.useFakeTimers();
    const handle = createMockContext();
    const doc = new MockDocument();
    const board = doc.createElement('div');
    board.setBoundingRect({ left: 0, top: 0, width: 100, height: 100 });

    const engine = createPointerEngine(handle.context, { throttleMs: 50 });
    engine.mount(board as unknown as HTMLElement);
    engine.activate();

    board.dispatch('mousemove', { clientX: 10, clientY: 10 });
    expect(handle.broadcasts).toHaveLength(1);

    board.dispatch('mousemove', { clientX: 40, clientY: 40 });
    board.dispatch('mousemove', { clientX: 80, clientY: 80 });
    expect(handle.broadcasts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(handle.broadcasts).toHaveLength(2);
    expect(handle.broadcasts[1]).toEqual({ x: 0.8, y: 0.8 });

    engine.unmount();
  });

  it('stops broadcasting when unmounted while active', () => {
    const handle = createMockContext();
    const doc = new MockDocument();
    const board = doc.createElement('div');

    const engine = createPointerEngine(handle.context, { throttleMs: 0 });
    engine.mount(board as unknown as HTMLElement);
    engine.activate();
    board.dispatch('mousemove', { clientX: 10, clientY: 10 });

    engine.unmount();
    expect(handle.stops).toBe(1);
  });

  it('exposes remote beams through getAll and subscribe', () => {
    const handle = createMockContext();
    const remote = createRemoteBeam();
    handle.setBeams([remote]);

    const engine = createPointerEngine(handle.context, { throttleMs: 0 });
    const seen = vi.fn();
    const unsubscribe = engine.subscribe(seen);

    expect(seen).toHaveBeenCalledWith([remote]);
    expect(engine.getAll()).toEqual([remote]);

    unsubscribe();
  });
});

describe('PointerEngine.render', () => {
  function getOverlayRoot(board: MockElement): MockElement {
    const root = board.children[0];
    if (!root) {
      throw new Error('Expected an overlay root.');
    }

    return root;
  }

  it('draws active remote beams over the container and drops inactive ones', () => {
    const handle = createMockContext();
    handle.setBeams([createRemoteBeam({ peerId: 'peer-a', x: 0.25, y: 0.75 })]);

    const doc = new MockDocument();
    const board = doc.createElement('div');
    doc.body.appendChild(board);

    const engine = createPointerEngine(handle.context, { throttleMs: 0 });
    engine.mount(board as unknown as HTMLElement);
    const cleanup = engine.render({
      container: board as unknown as HTMLElement,
      style: 'laser',
      zIndex: 42,
    });

    const overlayRoot = getOverlayRoot(board);
    expect(overlayRoot.getAttribute('data-roomful-pointer-root')).toBe('true');
    expect(overlayRoot.style.zIndex).toBe('42');
    expect(overlayRoot.children).toHaveLength(1);

    const node = overlayRoot.children[0];
    expect(node?.getAttribute('data-peer-id')).toBe('peer-a');
    expect(node?.getAttribute('data-roomful-pointer-style')).toBe('laser');
    expect(node?.style.left).toBe('25%');
    expect(node?.style.top).toBe('75%');
    expect(node?.style.backgroundColor).toBe('#22c55e');
    expect(node?.style.boxShadow).toContain('#22c55e');

    // An inactive beam is dropped from the overlay.
    handle.setBeams([createRemoteBeam({ peerId: 'peer-a', active: false })]);
    handle.emit();
    expect(overlayRoot.children).toHaveLength(0);

    cleanup();
    expect(board.children).toHaveLength(0);
  });

  it('rebuilds a peer node when the style changes and supports every style', () => {
    const handle = createMockContext();
    handle.setBeams([createRemoteBeam({ peerId: 'peer-a' })]);

    const doc = new MockDocument();
    const board = doc.createElement('div');
    doc.body.appendChild(board);

    const engine = createPointerEngine(handle.context, { throttleMs: 0 });
    engine.mount(board as unknown as HTMLElement);

    for (const style of ['dot', 'spotlight', 'crosshair'] as const) {
      engine.render({ container: board as unknown as HTMLElement, style });
      const node = getOverlayRoot(board).children[0];
      expect(node?.getAttribute('data-roomful-pointer-style')).toBe(style);
    }

    // 'dot' has no glow; spotlight paints a radial gradient.
    engine.render({ container: board as unknown as HTMLElement, style: 'dot' });
    expect(getOverlayRoot(board).children[0]?.style.boxShadow).toBe('none');
    engine.render({ container: board as unknown as HTMLElement, style: 'spotlight' });
    expect(getOverlayRoot(board).children[0]?.style.background).toContain('radial-gradient');

    engine.unmount();
    expect(board.children).toHaveLength(0);
  });
});

describe('PointerEngine room integration', () => {
  it('broadcasts a beam to a remote peer with its presence name/color via subscribe and getAll', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-pointer', {
      presence: { name: 'Alice', color: '#ef4444' },
    });
    const roomB = harness.createRoom<TestPresence>('engine-pointer', {
      presence: { name: 'Bob', color: '#3b82f6' },
    });

    const pointerA = roomA.usePointer({ throttleMs: 0 });
    const pointerB = roomB.usePointer({ throttleMs: 0 });
    const onRemote = vi.fn();
    pointerB.subscribe(onRemote);
    expect(onRemote).toHaveBeenCalledWith([]);

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const board = new MockElement(new MockDocument(), 'div');
    board.setBoundingRect({ left: 0, top: 0, width: 200, height: 200 });
    pointerA.mount(board as unknown as HTMLElement);
    pointerA.activate();
    board.dispatch('mousemove', { clientX: 50, clientY: 150 }); // -> 0.25, 0.75

    await harness.waitFor(() => pointerB.getAll().length === 1);

    const beams = pointerB.getAll();
    expect(beams[0]).toMatchObject({
      peerId: roomA.peerId,
      name: 'Alice',
      color: '#ef4444',
      x: 0.25,
      y: 0.75,
      active: true,
    });
    expect(onRemote).toHaveBeenLastCalledWith([
      expect.objectContaining({ peerId: roomA.peerId, active: true }),
    ]);

    pointerA.unmount();
  });

  it('drops a remote beam when the broadcasting peer deactivates', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-pointer-deactivate', {
      presence: { name: 'Alice', color: '#ef4444' },
    });
    const roomB = harness.createRoom<TestPresence>('engine-pointer-deactivate', {
      presence: { name: 'Bob', color: '#3b82f6' },
    });

    const pointerA = roomA.usePointer({ throttleMs: 0 });
    const pointerB = roomB.usePointer({ throttleMs: 0 });

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const board = new MockElement(new MockDocument(), 'div');
    board.setBoundingRect({ left: 0, top: 0, width: 200, height: 200 });
    pointerA.mount(board as unknown as HTMLElement);
    pointerA.activate();
    board.dispatch('mousemove', { clientX: 100, clientY: 100 });

    await harness.waitFor(() => pointerB.getAll().length === 1);

    pointerA.deactivate();
    await harness.waitFor(() => pointerB.getAll().length === 0);
    expect(pointerB.getAll()).toEqual([]);

    pointerA.unmount();
  });

  it('drops a remote beam when the broadcasting peer disconnects', async () => {
    harness = await createMockRoomHarness();

    const roomA = harness.createRoom<TestPresence>('engine-pointer-leave', {
      presence: { name: 'Alice', color: '#ef4444' },
    });
    const roomB = harness.createRoom<TestPresence>('engine-pointer-leave', {
      presence: { name: 'Bob', color: '#3b82f6' },
    });

    const pointerA = roomA.usePointer({ throttleMs: 0 });
    const pointerB = roomB.usePointer({ throttleMs: 0 });

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    const board = new MockElement(new MockDocument(), 'div');
    board.setBoundingRect({ left: 0, top: 0, width: 200, height: 200 });
    pointerA.mount(board as unknown as HTMLElement);
    pointerA.activate();
    board.dispatch('mousemove', { clientX: 100, clientY: 100 });

    await harness.waitFor(() => pointerB.getAll().length === 1);

    await roomA.disconnect();
    await harness.waitFor(() => pointerB.getAll().length === 0);
    expect(pointerB.getAll()).toEqual([]);

    pointerA.unmount();
  });
});
