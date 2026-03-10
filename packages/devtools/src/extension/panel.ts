import { createInspectedPageBridgeClient } from './bridge-client.js';
import { getExtensionDevtoolsApi } from './browser-api.js';
import { createDevtoolsPanelController } from './controller.js';

export function bootPanel(): void {
  const root = document.getElementById('app');
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const controller = createDevtoolsPanelController({
    client: createInspectedPageBridgeClient(getExtensionDevtoolsApi()),
    pollIntervalMs: 1_000,
    root,
  });

  void controller.start();
  globalThis.addEventListener(
    'beforeunload',
    () => {
      controller.stop();
    },
    { once: true },
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootPanel, {
    once: true,
  });
} else {
  bootPanel();
}
