import { describe, expect, it } from 'vitest';

import { createExtensionManifest } from './manifest.js';

describe('createExtensionManifest', () => {
  it('builds a Chrome manifest with a devtools page and generated icons', () => {
    const manifest = createExtensionManifest('chrome', '1.2.3');

    expect(manifest).toMatchObject({
      devtools_page: 'extension/devtools.html',
      icons: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
      manifest_version: 3,
      name: 'Cahoots DevTools',
      version: '1.2.3',
    });
    expect('browser_specific_settings' in manifest).toBe(false);
  });

  it('builds a Firefox manifest with browser-specific signing metadata', () => {
    const manifest = createExtensionManifest('firefox', '1.2.3');

    expect(manifest).toMatchObject({
      browser_specific_settings: {
        gecko: {
          id: 'devtools@cahoots.dev',
        },
      },
      data_collection_permissions: {
        required: [],
      },
      devtools_page: 'extension/devtools.html',
      manifest_version: 3,
      version: '1.2.3',
    });
  });
});
