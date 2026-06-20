import { createCoreHealth, createRoom } from '@cahoots/core';

const room = createRoom('publish-smoke-core', {
  presence: {
    name: 'Core Smoke',
  },
});

const awareness = room.useAwareness();
awareness.set({ mode: 'smoke' });

const state = room.useState({
  initialValue: { count: 0, label: 'core' },
  merge(local: { count: number; label: string }, remote: { count: number; label: string }) {
    return { ...local, ...remote };
  },
  strategy: 'custom',
});

state.patch({ count: 1 });

const summary = {
  health: createCoreHealth(),
  providerStatus: room.getYProvider().status,
  state: state.get(),
  yDocClientId: room.getYDoc().clientID,
};

const appElement = document.querySelector('#app');
if (appElement !== null) {
  appElement.textContent = JSON.stringify(summary, null, 2);
}
