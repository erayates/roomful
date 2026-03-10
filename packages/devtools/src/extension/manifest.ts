import type { SupportedExtensionBrowser } from './types.js';

interface BaseExtensionManifest {
  readonly description: string;
  readonly devtools_page: string;
  readonly icons: Record<16 | 32 | 48 | 128, string>;
  readonly manifest_version: 3;
  readonly name: string;
  readonly version: string;
}

interface FirefoxExtensionManifest extends BaseExtensionManifest {
  readonly browser_specific_settings: {
    readonly gecko: {
      readonly id: string;
    };
  };
  readonly data_collection_permissions: {
    readonly required: string[];
  };
}

export type ExtensionManifest = BaseExtensionManifest | FirefoxExtensionManifest;

const ICON_PATHS: BaseExtensionManifest['icons'] = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

export function createExtensionManifest(
  browser: SupportedExtensionBrowser,
  version: string,
): ExtensionManifest {
  const baseManifest: BaseExtensionManifest = {
    description:
      'Inspect FlockJS rooms, peers, state diffs, event traffic, and transport status from browser DevTools.',
    devtools_page: 'extension/devtools.html',
    icons: ICON_PATHS,
    manifest_version: 3,
    name: 'FlockJS DevTools',
    version,
  };

  if (browser === 'firefox') {
    return {
      ...baseManifest,
      browser_specific_settings: {
        gecko: {
          id: 'devtools@flockjs.dev',
        },
      },
      data_collection_permissions: {
        required: [],
      },
    };
  }

  return baseManifest;
}
