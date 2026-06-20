import { createRoom } from '/packages/core/dist/index.js';

const ROOM_EVENT_NAMES = [
  'connected',
  'disconnected',
  'reconnecting',
  'error',
  'peer:join',
  'peer:leave',
  'peer:update',
  'room:full',
  'room:empty',
];

const state = {
  room: null,
  eventEngine: null,
  cursorEngine: null,
  presenceEngine: null,
  stateEngine: null,
  awarenessEngine: null,
  roomEventUnsubscribes: [],
  customEventUnsubscribes: [],
  yjsUnsubscribes: [],
  cursorUnsubscribe: null,
  presenceUnsubscribe: null,
  stateUnsubscribe: null,
  awarenessUnsubscribe: null,
  roomEvents: [],
  customEvents: [],
  cursorPositions: [],
  presencePeers: [],
  presenceUpdates: [],
  sharedState: null,
  stateChanges: [],
  awarenessPeers: [],
  awarenessUpdates: [],
  yDoc: null,
  yProvider: null,
  yjsConfig: {
    textKeys: [],
    arrayKeys: [],
    mapKeys: [],
  },
  yjsEvents: [],
  rtc: {
    available: typeof RTCPeerConnection === 'function',
    peerConnectionsCreated: 0,
    dataChannelsCreated: 0,
    dataChannelsOpened: 0,
  },
  originalDateNow: Date.now.bind(Date),
};

function snapshotValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(typeof value.code === 'string' ? { code: value.code } : {}),
      ...(typeof value.recoverable === 'boolean' ? { recoverable: value.recoverable } : {}),
      ...(value.cause !== undefined ? { cause: snapshotValue(value.cause) } : {}),
    };
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      return String(value);
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function recordRoomEvent(name, payload) {
  state.roomEvents.push({
    kind: 'room',
    name,
    payload: snapshotValue(payload),
    at: Date.now(),
  });
}

function recordCustomEvent(name, payload, from) {
  state.customEvents.push({
    kind: 'custom',
    name,
    payload: snapshotValue(payload),
    from: snapshotValue(from),
    at: Date.now(),
  });
}

function clearSubscriptions() {
  for (const unsubscribe of state.roomEventUnsubscribes) {
    unsubscribe();
  }

  for (const unsubscribe of state.customEventUnsubscribes) {
    unsubscribe();
  }

  for (const unsubscribe of state.yjsUnsubscribes) {
    unsubscribe();
  }

  state.cursorUnsubscribe?.();
  state.cursorUnsubscribe = null;
  state.presenceUnsubscribe?.();
  state.presenceUnsubscribe = null;
  state.stateUnsubscribe?.();
  state.stateUnsubscribe = null;
  state.awarenessUnsubscribe?.();
  state.awarenessUnsubscribe = null;

  state.roomEventUnsubscribes = [];
  state.customEventUnsubscribes = [];
  state.yjsUnsubscribes = [];
}

function resetState() {
  clearSubscriptions();
  state.cursorEngine?.unmount();
  Date.now = state.originalDateNow;
  state.roomEvents = [];
  state.customEvents = [];
  state.cursorPositions = [];
  state.eventEngine = null;
  state.cursorEngine = null;
  state.presenceEngine = null;
  state.stateEngine = null;
  state.awarenessEngine = null;
  state.presencePeers = [];
  state.presenceUpdates = [];
  state.sharedState = null;
  state.stateChanges = [];
  state.awarenessPeers = [];
  state.awarenessUpdates = [];
  state.yDoc = null;
  state.yProvider = null;
  state.yjsConfig = {
    textKeys: [],
    arrayKeys: [],
    mapKeys: [],
  };
  state.yjsEvents = [];
}

function getBoardElement() {
  const board = document.getElementById('board');
  if (!(board instanceof HTMLElement)) {
    throw new Error('Cursor board element is not available.');
  }

  return board;
}

function createSyntheticTouchEvent(type, clientX, clientY) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });
  const touchPoint = {
    clientX,
    clientY,
  };

  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: [touchPoint],
  });
  Object.defineProperty(event, 'changedTouches', {
    configurable: true,
    value: [touchPoint],
  });

  return event;
}

function getRenderedCursorSnapshot() {
  const board = getBoardElement();
  return Array.from(board.querySelectorAll('[data-roomful-peer-cursor]')).map((node) => {
    const marker = node.querySelector('[data-roomful-cursor-marker]');
    const label = node.querySelector('[data-roomful-cursor-label]');
    return {
      userId: node.getAttribute('data-user-id'),
      text: node.textContent ?? '',
      left: node.style.left,
      top: node.style.top,
      idle: node.getAttribute('data-idle'),
      transition: node.style.transition,
      style: node.getAttribute('data-roomful-cursor-style'),
      markerTag: marker?.tagName.toLowerCase() ?? null,
      markerStyle: marker?.getAttribute('data-roomful-cursor-marker-style') ?? null,
      markerColor: marker?.getAttribute('data-roomful-cursor-marker-color') ?? null,
      labelDisplay: label instanceof HTMLElement ? label.style.display : null,
    };
  });
}

function rememberTrackedYjsKey(kind, key) {
  const collection = state.yjsConfig[kind];
  if (!collection.includes(key)) {
    collection.push(key);
  }
}

function getYjsSnapshot() {
  const texts = {};
  const arrays = {};
  const maps = {};

  if (state.yDoc) {
    for (const key of state.yjsConfig.textKeys) {
      texts[key] = state.yDoc.getText(key).toString();
    }

    for (const key of state.yjsConfig.arrayKeys) {
      arrays[key] = snapshotValue(state.yDoc.getArray(key).toArray());
    }

    for (const key of state.yjsConfig.mapKeys) {
      maps[key] = snapshotValue(state.yDoc.getMap(key).toJSON());
    }
  }

  return {
    texts,
    arrays,
    maps,
    provider: {
      status: state.yProvider ? state.yProvider.status : 'disconnected',
      synced: state.yProvider ? state.yProvider.synced : false,
      events: snapshotValue(state.yjsEvents),
    },
  };
}

function instrumentRtcChannel(channel) {
  if (channel.__roomfulInstrumented) {
    return;
  }

  channel.__roomfulInstrumented = true;
  if (channel.readyState === 'open') {
    state.rtc.dataChannelsOpened += 1;
  }

  channel.addEventListener('open', () => {
    state.rtc.dataChannelsOpened += 1;
  });
}

function installRtcInstrumentation() {
  if (typeof RTCPeerConnection !== 'function') {
    return;
  }

  const NativeRTCPeerConnection = RTCPeerConnection;

  class InstrumentedRTCPeerConnection extends NativeRTCPeerConnection {
    constructor(...args) {
      super(...args);
      state.rtc.peerConnectionsCreated += 1;
      this.addEventListener('datachannel', (event) => {
        instrumentRtcChannel(event.channel);
      });
    }

    createDataChannel(label, options) {
      const channel = super.createDataChannel(label, options);
      state.rtc.dataChannelsCreated += 1;
      instrumentRtcChannel(channel);
      return channel;
    }
  }

  window.RTCPeerConnection = InstrumentedRTCPeerConnection;
}

installRtcInstrumentation();

window.__roomfulIntegration = {
  async initRoom(config) {
    if (state.room) {
      await state.room.disconnect();
    }

    resetState();

    state.room = createRoom(config.roomId, config.options ?? {});
    state.eventEngine = state.room.useEvents();

    for (const eventName of ROOM_EVENT_NAMES) {
      const unsubscribe = state.room.on(eventName, (payload) => {
        recordRoomEvent(eventName, payload);
      });
      state.roomEventUnsubscribes.push(unsubscribe);
    }

    for (const eventName of config.eventNames ?? []) {
      const unsubscribe = state.eventEngine.on(eventName, (payload, from) => {
        recordCustomEvent(eventName, payload, from);
      });
      state.customEventUnsubscribes.push(unsubscribe);
    }
  },

  async connect() {
    if (!state.room) {
      throw new Error('Room has not been initialized.');
    }

    await state.room.connect();
  },

  async disconnect() {
    if (!state.room) {
      return;
    }

    await state.room.disconnect();
  },

  emit({ name, payload }) {
    if (!state.eventEngine) {
      throw new Error('Event engine is not initialized.');
    }

    state.eventEngine.emit(name, payload);
  },

  emitTo({ peerId, name, payload }) {
    if (!state.eventEngine) {
      throw new Error('Event engine is not initialized.');
    }

    state.eventEngine.emitTo(peerId, name, payload);
  },

  mountCursors(config = {}) {
    if (!state.room) {
      throw new Error('Room has not been initialized.');
    }

    const board = getBoardElement();
    state.cursorEngine = state.room.useCursors(config.options ?? {});
    state.cursorEngine.mount(board);
    state.cursorUnsubscribe?.();
    state.cursorUnsubscribe = state.cursorEngine.subscribe((positions) => {
      state.cursorPositions = snapshotValue(positions);
    });

    if (config.render !== false) {
      state.cursorEngine.render({
        container: board,
        showName: true,
        ...(config.renderOptions ?? {}),
      });
    }
  },

  mountPresence() {
    if (!state.room) {
      throw new Error('Room has not been initialized.');
    }

    state.presenceEngine = state.room.usePresence();
    state.presencePeers = snapshotValue(state.presenceEngine.getAll());
    state.presenceUpdates = [];
    state.presenceUnsubscribe?.();
    state.presenceUnsubscribe = state.presenceEngine.subscribe((peers) => {
      const snapshot = snapshotValue(peers);
      state.presencePeers = snapshot;
      state.presenceUpdates.push({
        peers: snapshot,
        at: Date.now(),
      });
    });
  },

  mountState(config = {}) {
    if (!state.room) {
      throw new Error('Room has not been initialized.');
    }

    state.stateEngine = state.room.useState(config.options ?? { initialValue: {} });
    state.sharedState = snapshotValue(state.stateEngine.get());
    state.stateChanges = [];
    state.stateUnsubscribe?.();
    state.stateUnsubscribe = state.stateEngine.subscribe((value, meta) => {
      state.sharedState = snapshotValue(value);
      state.stateChanges.push({
        value: snapshotValue(value),
        meta: snapshotValue(meta),
        at: Date.now(),
      });
    });
  },

  mountYjs(config = {}) {
    if (!state.room) {
      throw new Error('Room has not been initialized.');
    }

    state.yDoc = state.room.getYDoc();
    state.yProvider = state.room.getYProvider();
    state.yjsConfig = {
      textKeys: [...(config.textKeys ?? [])],
      arrayKeys: [...(config.arrayKeys ?? [])],
      mapKeys: [...(config.mapKeys ?? [])],
    };
    state.yjsEvents = [];

    state.yjsUnsubscribes.push(
      state.yProvider.on('status', (payload) => {
        state.yjsEvents.push({
          kind: 'provider',
          name: 'status',
          payload: snapshotValue(payload),
          at: Date.now(),
        });
      }),
    );
    state.yjsUnsubscribes.push(
      state.yProvider.on('sync', (payload) => {
        state.yjsEvents.push({
          kind: 'provider',
          name: 'sync',
          payload: snapshotValue(payload),
          at: Date.now(),
        });
      }),
    );
  },

  mountAwareness() {
    if (!state.room) {
      throw new Error('Room has not been initialized.');
    }

    state.awarenessEngine = state.room.useAwareness();
    state.awarenessPeers = snapshotValue(state.awarenessEngine.getAll());
    state.awarenessUpdates = [];
    state.awarenessUnsubscribe?.();
    state.awarenessUnsubscribe = state.awarenessEngine.subscribe((peers) => {
      const snapshot = snapshotValue(peers);
      state.awarenessPeers = snapshot;
      state.awarenessUpdates.push({
        peers: snapshot,
        at: Date.now(),
      });
    });
  },

  updatePresence(value) {
    if (!state.presenceEngine) {
      throw new Error('Presence engine is not initialized.');
    }

    state.presenceEngine.update(value);
  },

  replacePresence(value) {
    if (!state.presenceEngine) {
      throw new Error('Presence engine is not initialized.');
    }

    state.presenceEngine.replace(value);
  },

  setState(value) {
    if (!state.stateEngine) {
      throw new Error('State engine is not initialized.');
    }

    state.stateEngine.set(value);
  },

  patchState(partial) {
    if (!state.stateEngine) {
      throw new Error('State engine is not initialized.');
    }

    state.stateEngine.patch(partial);
  },

  undoState() {
    if (!state.stateEngine) {
      throw new Error('State engine is not initialized.');
    }

    state.stateEngine.undo();
  },

  resetState() {
    if (!state.stateEngine) {
      throw new Error('State engine is not initialized.');
    }

    state.stateEngine.reset();
  },

  setAwareness(value) {
    if (!state.awarenessEngine) {
      throw new Error('Awareness engine is not initialized.');
    }

    state.awarenessEngine.set(value);
  },

  setTyping(isTyping) {
    if (!state.awarenessEngine) {
      throw new Error('Awareness engine is not initialized.');
    }

    state.awarenessEngine.setTyping(isTyping);
  },

  setFocus(elementId) {
    if (!state.awarenessEngine) {
      throw new Error('Awareness engine is not initialized.');
    }

    state.awarenessEngine.setFocus(elementId);
  },

  setSelection(selection) {
    if (!state.awarenessEngine) {
      throw new Error('Awareness engine is not initialized.');
    }

    state.awarenessEngine.setSelection(selection);
  },

  getStateSnapshot() {
    return {
      value: snapshotValue(state.sharedState),
      changes: snapshotValue(state.stateChanges),
    };
  },

  insertYText({ key, index, text }) {
    if (!state.yDoc) {
      throw new Error('Yjs document is not initialized.');
    }

    rememberTrackedYjsKey('textKeys', key);
    state.yDoc.getText(key).insert(index, text);
  },

  pushYArray({ key, values }) {
    if (!state.yDoc) {
      throw new Error('Yjs document is not initialized.');
    }

    rememberTrackedYjsKey('arrayKeys', key);
    state.yDoc.getArray(key).push(values);
  },

  setYMapValue({ key, entryKey, value }) {
    if (!state.yDoc) {
      throw new Error('Yjs document is not initialized.');
    }

    rememberTrackedYjsKey('mapKeys', key);
    state.yDoc.getMap(key).set(entryKey, value);
  },

  getYjsSnapshot() {
    return getYjsSnapshot();
  },

  getPresenceSnapshot() {
    return {
      peers: snapshotValue(state.presencePeers),
      updates: snapshotValue(state.presenceUpdates),
    };
  },

  getAwarenessSnapshot() {
    return {
      peers: snapshotValue(state.awarenessPeers),
      updates: snapshotValue(state.awarenessUpdates),
    };
  },

  unmountCursors() {
    state.cursorUnsubscribe?.();
    state.cursorUnsubscribe = null;
    state.cursorPositions = [];
    state.cursorEngine?.unmount();
    state.cursorEngine = null;
  },

  dispatchCursorMove({ x, y, kind = 'mouse' }) {
    const board = getBoardElement();
    const rect = board.getBoundingClientRect();
    const clientX = rect.left + rect.width * x;
    const clientY = rect.top + rect.height * y;

    if (kind === 'touchstart' || kind === 'touchmove') {
      board.dispatchEvent(createSyntheticTouchEvent(kind, clientX, clientY));
      return;
    }

    board.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX,
        clientY,
      }),
    );
  },

  getSnapshot() {
    return {
      peerId: state.room ? state.room.peerId : null,
      status: state.room ? state.room.status : null,
      peerCount: state.room ? state.room.peerCount : 0,
      peers: state.room ? snapshotValue(state.room.peers) : [],
      roomEvents: snapshotValue(state.roomEvents),
      customEvents: snapshotValue(state.customEvents),
      rtc: {
        ...state.rtc,
        dataChannelOpened: state.rtc.dataChannelsOpened > 0,
      },
    };
  },

  getCursorState() {
    return {
      positions: snapshotValue(state.cursorPositions),
      rendered: snapshotValue(getRenderedCursorSnapshot()),
    };
  },

  getState() {
    return window.__roomfulIntegration.getStateSnapshot();
  },

  setTimeOverride(timestamp) {
    Date.now = () => timestamp;
  },

  clearTimeOverride() {
    Date.now = state.originalDateNow;
  },

  getEvents() {
    return [...state.roomEvents, ...state.customEvents].map((event) => {
      return snapshotValue(event);
    });
  },

  async waitForEvent({ kind, name, timeoutMs = 5000 }) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const events = kind === 'custom' ? state.customEvents : state.roomEvents;
      const match = events.find((event) => {
        return event.name === name;
      });

      if (match) {
        return snapshotValue(match);
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 25);
      });
    }

    return null;
  },
};
