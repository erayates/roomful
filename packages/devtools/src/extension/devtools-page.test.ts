import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    createDevtoolsPanel: vi.fn(async () => {
      return undefined;
    }),
    getExtensionDevtoolsApi: vi.fn(),
  };
});

vi.mock('./browser-api.js', () => {
  return {
    createDevtoolsPanel: mocks.createDevtoolsPanel,
    getExtensionDevtoolsApi: mocks.getExtensionDevtoolsApi,
  };
});

describe('bootDevtoolsPanel', () => {
  afterEach(() => {
    mocks.createDevtoolsPanel.mockClear();
    mocks.getExtensionDevtoolsApi.mockReset();
    vi.resetModules();
  });

  it('creates the DevTools panel when the runtime api is available', async () => {
    const devtoolsApi = {
      inspectedWindow: {
        eval: vi.fn(),
      },
      panels: {
        create: vi.fn(),
      },
    };
    mocks.getExtensionDevtoolsApi.mockReturnValue(devtoolsApi);

    const module = await import('./devtools-page.js');

    expect(typeof module.bootDevtoolsPanel).toBe('function');
    expect(mocks.createDevtoolsPanel).toHaveBeenCalledWith(
      devtoolsApi,
      'FlockJS',
      'icons/icon-32.png',
      'extension/panel.html',
    );
  });

  it('does nothing when the runtime api is unavailable', async () => {
    mocks.getExtensionDevtoolsApi.mockReturnValue(null);

    const module = await import('./devtools-page.js');

    expect(typeof module.bootDevtoolsPanel).toBe('function');
    expect(mocks.createDevtoolsPanel).not.toHaveBeenCalled();
  });
});
