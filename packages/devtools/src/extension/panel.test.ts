// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const start = vi.fn(async () => {
    return undefined;
  });
  const stop = vi.fn();

  return {
    createDevtoolsPanelController: vi.fn(() => {
      return {
        start,
        stop,
      };
    }),
    createInspectedPageBridgeClient: vi.fn(() => {
      return {
        disconnectSimulatedPeer: vi.fn(),
        injectSimulatedPeer: vi.fn(),
        readRooms: vi.fn(),
        readSnapshot: vi.fn(),
      };
    }),
    getExtensionDevtoolsApi: vi.fn(() => {
      return {
        inspectedWindow: {
          eval: vi.fn(),
        },
        panels: {
          create: vi.fn(),
        },
      };
    }),
    start,
    stop,
  };
});

vi.mock('./browser-api.js', () => {
  return {
    getExtensionDevtoolsApi: mocks.getExtensionDevtoolsApi,
  };
});

vi.mock('./bridge-client.js', () => {
  return {
    createInspectedPageBridgeClient: mocks.createInspectedPageBridgeClient,
  };
});

vi.mock('./controller.js', () => {
  return {
    createDevtoolsPanelController: mocks.createDevtoolsPanelController,
  };
});

describe('bootPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    mocks.createDevtoolsPanelController.mockClear();
    mocks.createInspectedPageBridgeClient.mockClear();
    mocks.getExtensionDevtoolsApi.mockClear();
    mocks.start.mockClear();
    mocks.stop.mockClear();
    vi.resetModules();
  });

  it('creates the controller and stops it on unload', async () => {
    document.body.innerHTML = '<div id="app"></div>';

    const module = await import('./panel.js');

    expect(typeof module.bootPanel).toBe('function');
    expect(mocks.getExtensionDevtoolsApi).toHaveBeenCalled();
    expect(mocks.createInspectedPageBridgeClient).toHaveBeenCalled();
    expect(mocks.createDevtoolsPanelController).toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalled();

    globalThis.dispatchEvent(new Event('beforeunload'));
    expect(mocks.stop).toHaveBeenCalled();
  });

  it('does nothing when the root element is missing', async () => {
    const module = await import('./panel.js');

    expect(typeof module.bootPanel).toBe('function');
    expect(mocks.createDevtoolsPanelController).not.toHaveBeenCalled();
  });
});
