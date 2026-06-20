import { expect, test } from '@playwright/test';

interface ReactAppConfig {
  color: string;
  id: string;
  name: string;
  roomId: string;
}

interface ReactHarnessSnapshot {
  boardAttached: boolean;
  cursorCount: number;
  cursorLabels: string[];
  peerCount: number;
  peers: string[];
  renderCount: number;
  sharedCount: number;
  status: string;
}

declare global {
  interface Window {
    __flockjsReactIntegration: {
      clickSharedState(id: string): void;
      dispatchCursorMove(id: string, input: { x: number; y: number }): void;
      getSnapshot(id: string): ReactHarnessSnapshot;
      mountApp(config: ReactAppConfig): void;
      unmountApp(id: string): void;
    };
  }
}

let roomCounter = 0;

function nextRoomId(prefix: string): string {
  roomCounter += 1;
  return `${prefix}-${Date.now()}-${roomCounter}`;
}

test.describe.configure({ mode: 'serial' });

test.describe('React adapter Playwright integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('FlockJS React integration fixture');
    await page.waitForFunction(() => {
      return typeof window.__flockjsReactIntegration !== 'undefined';
    });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      if (!window.__flockjsReactIntegration) {
        return;
      }

      for (const id of ['alpha', 'beta', 'primary']) {
        window.__flockjsReactIntegration.unmountApp(id);
      }
    });
  });

  test('mounts FlockProvider and connects successfully in a browser', async ({ page }) => {
    const roomId = nextRoomId('playwright-provider-connect');

    await page.evaluate(
      (config) => {
        window.__flockjsReactIntegration.mountApp(config);
      },
      {
        color: '#111111',
        id: 'primary',
        name: 'Primary',
        roomId,
      },
    );

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return window.__flockjsReactIntegration.getSnapshot('primary').status;
        });
      })
      .toBe('connected');
  });

  test('syncs presence and shared state between two mounted apps', async ({ page }) => {
    const roomId = nextRoomId('playwright-shared-state');

    await page.evaluate(
      (configs) => {
        for (const config of configs) {
          window.__flockjsReactIntegration.mountApp(config);
        }
      },
      [
        {
          color: '#111111',
          id: 'alpha',
          name: 'Alpha',
          roomId,
        },
        {
          color: '#222222',
          id: 'beta',
          name: 'Beta',
          roomId,
        },
      ],
    );

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return window.__flockjsReactIntegration.getSnapshot('alpha').peerCount;
        });
      })
      .toBe(1);
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return window.__flockjsReactIntegration.getSnapshot('beta').peerCount;
        });
      })
      .toBe(1);

    await page.evaluate(() => {
      window.__flockjsReactIntegration.clickSharedState('alpha');
    });

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return window.__flockjsReactIntegration.getSnapshot('alpha').sharedCount;
        });
      })
      .toBe(1);
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return window.__flockjsReactIntegration.getSnapshot('beta').sharedCount;
        });
      })
      .toBe(1);

    await page.evaluate(() => {
      window.__flockjsReactIntegration.unmountApp('beta');
    });

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return window.__flockjsReactIntegration.getSnapshot('alpha').peerCount;
        });
      })
      .toBe(0);
  });

  test('attaches the useCursors ref and renders remote cursors', async ({ page }) => {
    const roomId = nextRoomId('playwright-cursors');

    await page.evaluate(
      (configs) => {
        for (const config of configs) {
          window.__flockjsReactIntegration.mountApp(config);
        }
      },
      [
        {
          color: '#111111',
          id: 'alpha',
          name: 'Alpha',
          roomId,
        },
        {
          color: '#222222',
          id: 'beta',
          name: 'Beta',
          roomId,
        },
      ],
    );

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const snapshot = window.__flockjsReactIntegration.getSnapshot('alpha');
          return snapshot.boardAttached && snapshot.status === 'connected'
            ? snapshot.peerCount
            : -1;
        });
      })
      .toBe(1);

    await page.evaluate(() => {
      window.__flockjsReactIntegration.dispatchCursorMove('alpha', {
        x: 0.25,
        y: 0.5,
      });
    });

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return window.__flockjsReactIntegration.getSnapshot('beta');
        });
      })
      .toMatchObject({
        boardAttached: true,
        cursorCount: 1,
        cursorLabels: ['Alpha'],
      });

    await page.evaluate(() => {
      window.__flockjsReactIntegration.unmountApp('alpha');
    });

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return window.__flockjsReactIntegration.getSnapshot('beta');
        });
      })
      .toMatchObject({
        cursorCount: 0,
        peerCount: 0,
      });
  });
});
