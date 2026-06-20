import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  CahootsProvider,
  useConnectionStatus,
  useCursors,
  usePresence,
  useSharedState,
} from '@cahoots/react-local';

const { createElement, useRef } = React;

const state = {
  apps: new Map(),
};

function ensureContainer(id) {
  const fixtures = document.getElementById('fixtures');
  if (!(fixtures instanceof HTMLElement)) {
    throw new Error('Fixture container is unavailable.');
  }

  const existing = document.querySelector(`[data-app-root="${id}"]`);
  if (existing instanceof HTMLElement) {
    existing.remove();
  }

  const container = document.createElement('div');
  container.setAttribute('data-app-root', id);
  fixtures.append(container);
  return container;
}

function readTextContent(testId) {
  const node = document.querySelector(`[data-testid="${testId}"]`);
  return node instanceof HTMLElement ? (node.textContent ?? '') : '';
}

function getCursorLabels(appId) {
  return Array.from(document.querySelectorAll(`[data-testid="remote-cursor-${appId}"]`)).map(
    (node) => {
      return node.textContent ?? '';
    },
  );
}

function getAppSnapshot(appId) {
  const board = document.querySelector(`[data-testid="board-${appId}"]`);
  return {
    boardAttached: board instanceof HTMLElement,
    cursorCount: getCursorLabels(appId).length,
    cursorLabels: getCursorLabels(appId),
    peerCount: Number.parseInt(readTextContent(`peer-count-${appId}`) || '0', 10),
    peers: readTextContent(`peers-${appId}`)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    renderCount: Number.parseInt(readTextContent(`render-count-${appId}`) || '0', 10),
    sharedCount: Number.parseInt(readTextContent(`shared-count-${appId}`) || '0', 10),
    status: readTextContent(`status-${appId}`),
  };
}

function AppContents({ appId }) {
  const status = useConnectionStatus();
  const peerState = usePresence();
  const [sharedValue, setSharedValue] = useSharedState('browser-shared-counter', {
    initialValue: {
      count: 0,
    },
    persist: false,
  });
  const { cursors, ref } = useCursors();
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  return createElement(
    'section',
    {
      'data-testid': `app-${appId}`,
    },
    createElement('span', { 'data-testid': `status-${appId}` }, status),
    createElement(
      'span',
      { 'data-testid': `peer-count-${appId}` },
      String(peerState.others.length),
    ),
    createElement(
      'span',
      { 'data-testid': `peers-${appId}` },
      peerState.others
        .map((peer) => {
          return peer.name ?? peer.id;
        })
        .join(','),
    ),
    createElement('span', { 'data-testid': `shared-count-${appId}` }, String(sharedValue.count)),
    createElement(
      'span',
      { 'data-testid': `render-count-${appId}` },
      String(renderCountRef.current),
    ),
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': `increment-${appId}`,
        onClick: () => {
          setSharedValue((previous) => {
            return {
              count: previous.count + 1,
            };
          });
        },
      },
      `increment-${appId}`,
    ),
    createElement(
      'div',
      {
        'data-testid': `board-${appId}`,
        ref,
        style: {
          border: '1px solid #a1a1aa',
          height: '120px',
          marginTop: '12px',
          position: 'relative',
          width: '240px',
        },
      },
      cursors.map((cursor) => {
        return createElement(
          'div',
          {
            key: cursor.userId,
            'data-testid': `remote-cursor-${appId}`,
            style: {
              left: `${cursor.x * 100}%`,
              position: 'absolute',
              top: `${cursor.y * 100}%`,
              transform: 'translate(-50%, -50%)',
            },
          },
          cursor.name,
        );
      }),
    ),
  );
}

function App({ appId, roomId, color, name }) {
  return createElement(
    CahootsProvider,
    {
      roomId,
      transport: 'broadcast',
      presence: {
        color,
        name,
      },
    },
    createElement(AppContents, { appId }),
  );
}

window.__cahootsReactIntegration = {
  mountApp(config) {
    const container = ensureContainer(config.id);
    const root = createRoot(container);
    root.render(
      createElement(App, {
        appId: config.id,
        color: config.color,
        name: config.name,
        roomId: config.roomId,
      }),
    );
    state.apps.set(config.id, {
      container,
      root,
    });
  },

  unmountApp(id) {
    const entry = state.apps.get(id);
    if (!entry) {
      return;
    }

    entry.root.unmount();
    entry.container.remove();
    state.apps.delete(id);
  },

  clickSharedState(id) {
    const button = document.querySelector(`[data-testid="increment-${id}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Increment button for ${id} is unavailable.`);
    }

    button.click();
  },

  dispatchCursorMove(id, input) {
    const board = document.querySelector(`[data-testid="board-${id}"]`);
    if (!(board instanceof HTMLElement)) {
      throw new Error(`Cursor board for ${id} is unavailable.`);
    }

    const rect = board.getBoundingClientRect();
    const clientX = rect.left + rect.width * input.x;
    const clientY = rect.top + rect.height * input.y;
    board.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX,
        clientY,
      }),
    );
  },

  getSnapshot(id) {
    return getAppSnapshot(id);
  },
};
