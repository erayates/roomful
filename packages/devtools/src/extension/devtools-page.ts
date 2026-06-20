import { createDevtoolsPanel, getExtensionDevtoolsApi } from './browser-api.js';

export async function bootDevtoolsPanel(): Promise<void> {
  const devtoolsApi = getExtensionDevtoolsApi();
  if (!devtoolsApi) {
    return;
  }

  await createDevtoolsPanel(devtoolsApi, 'Cahoots', 'icons/icon-32.png', 'extension/panel.html');
}

void bootDevtoolsPanel();
