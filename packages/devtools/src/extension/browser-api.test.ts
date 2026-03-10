// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDevtoolsPanel, getExtensionBrowserApi, getExtensionDevtoolsApi } from './browser-api.js';
import type { ExtensionBrowserApi, ExtensionDevtoolsApi } from './types.js';

function createDevtoolsApi(
  panelsCreate: ExtensionDevtoolsApi['panels']['create'],
): ExtensionDevtoolsApi {
  return {
    inspectedWindow: {
      eval() {
        return undefined;
      },
    },
    panels: {
      create: panelsCreate,
    },
  };
}

function clearBrowserApis(): void {
  delete window.browser;
  delete window.chrome;
}

describe('browser api helpers', () => {
  afterEach(() => {
    clearBrowserApis();
  });

  it('prefers window.browser over window.chrome', () => {
    const browserApi: ExtensionBrowserApi = {
      devtools: createDevtoolsApi(() => {
        return undefined;
      }),
    };
    const chromeApi: ExtensionBrowserApi = {
      devtools: createDevtoolsApi(() => {
        return undefined;
      }),
    };

    window.browser = browserApi;
    window.chrome = chromeApi;

    expect(getExtensionBrowserApi()).toBe(browserApi);
    expect(getExtensionDevtoolsApi()).toBe(browserApi.devtools);
  });

  it('falls back to window.chrome when browser is unavailable', () => {
    const chromeApi: ExtensionBrowserApi = {
      devtools: createDevtoolsApi(() => {
        return undefined;
      }),
    };

    window.chrome = chromeApi;

    expect(getExtensionBrowserApi()).toBe(chromeApi);
    expect(getExtensionDevtoolsApi()).toBe(chromeApi.devtools);
  });

  it('supports callback-based panel creation', async () => {
    const callbackPanelsCreate = vi.fn(
      (
        _title: string,
        _iconPath: string,
        _pagePath: string,
        callback?: () => void,
      ) => {
        callback?.();
        return undefined;
      },
    );
    const devtoolsApi = createDevtoolsApi(callbackPanelsCreate);

    await expect(
      createDevtoolsPanel(devtoolsApi, 'FlockJS', 'icons/icon-32.png', 'extension/panel.html'),
    ).resolves.toBeUndefined();
    expect(callbackPanelsCreate).toHaveBeenCalledWith(
      'FlockJS',
      'icons/icon-32.png',
      'extension/panel.html',
      expect.any(Function),
    );
  });

  it('supports promise-based panel creation', async () => {
    const promisePanelsCreate = vi.fn(async () => {
      return undefined;
    });
    const devtoolsApi = createDevtoolsApi(promisePanelsCreate);

    await expect(
      createDevtoolsPanel(devtoolsApi, 'FlockJS', 'icons/icon-32.png', 'extension/panel.html'),
    ).resolves.toBeUndefined();
    expect(promisePanelsCreate).toHaveBeenCalled();
  });
});
