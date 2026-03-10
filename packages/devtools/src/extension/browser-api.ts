import type { ExtensionBrowserApi, ExtensionDevtoolsApi } from './types.js';

declare global {
  interface Window {
    browser?: ExtensionBrowserApi;
    chrome?: ExtensionBrowserApi;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBrowserApi(value: unknown): value is ExtensionBrowserApi {
  return isObject(value);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isObject(value) && typeof value.then === 'function';
}

export function getExtensionBrowserApi(): ExtensionBrowserApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const browserApi = window.browser;
  if (isBrowserApi(browserApi)) {
    return browserApi;
  }

  const chromeApi = window.chrome;
  if (isBrowserApi(chromeApi)) {
    return chromeApi;
  }

  return null;
}

export function getExtensionDevtoolsApi(): ExtensionDevtoolsApi | null {
  return getExtensionBrowserApi()?.devtools ?? null;
}

export async function createDevtoolsPanel(
  devtoolsApi: ExtensionDevtoolsApi,
  title: string,
  iconPath: string,
  pagePath: string,
): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    try {
      const maybePromise = devtoolsApi.panels.create(title, iconPath, pagePath, finish);
      if (isPromiseLike(maybePromise)) {
        void maybePromise.then(finish, finish);
        return;
      }

      if (devtoolsApi.panels.create.length < 4) {
        finish();
      }
    } catch {
      finish();
    }
  });
}
