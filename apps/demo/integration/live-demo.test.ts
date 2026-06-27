import { createServer } from 'node:net';

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { createRelayServer, type RelayServer } from '../../../packages/relay/src/index';

const DEMO_IDENTITY_STORAGE_KEY = 'roomful-demo-identity';

async function reserveRelayPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to reserve a relay port.'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function seedIdentity(context: BrowserContext, name: string, color: string): Promise<void> {
  await context.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: DEMO_IDENTITY_STORAGE_KEY,
      value: { color, name },
    },
  );
}

async function openDemo(page: Page, relayUrl: string, query = ''): Promise<void> {
  const prefix = query === '' ? '?' : `${query}&`;
  await page.goto(`/${prefix}relay=${encodeURIComponent(relayUrl)}`);
}

async function drawStroke(page: Page): Promise<void> {
  await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-testid="demo-canvas-surface"]');
    if (!surface) {
      throw new Error('Canvas surface not found.');
    }

    const bounds = surface.getBoundingClientRect();
    const startX = bounds.left + bounds.width * 0.25;
    const startY = bounds.top + bounds.height * 0.35;
    const endX = bounds.left + bounds.width * 0.65;
    const endY = bounds.top + bounds.height * 0.58;
    const dispatch = (type: string, clientX: number, clientY: number, buttons: number) => {
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          buttons,
          cancelable: true,
          clientX,
          clientY,
          isPrimary: true,
          pointerId: 11,
          pointerType: 'mouse',
        }),
      );
    };

    dispatch('pointerdown', startX, startY, 1);
    dispatch('pointermove', endX, endY, 1);
    dispatch('pointerup', endX, endY, 0);
  });
}

async function dispatchTouchStroke(page: Page): Promise<void> {
  await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('[data-testid="demo-canvas-surface"]');
    if (!surface) {
      throw new Error('Canvas surface not found.');
    }

    const bounds = surface.getBoundingClientRect();
    const startX = bounds.left + bounds.width * 0.28;
    const startY = bounds.top + bounds.height * 0.34;
    const endX = bounds.left + bounds.width * 0.62;
    const endY = bounds.top + bounds.height * 0.54;
    const dispatch = (type: string, clientX: number, clientY: number, buttons: number) => {
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          buttons,
          cancelable: true,
          clientX,
          clientY,
          isPrimary: true,
          pointerId: 19,
          pointerType: 'touch',
        }),
      );
    };

    dispatch('pointerdown', startX, startY, 1);
    dispatch('pointermove', endX, endY, 1);
    dispatch('pointerup', endX, endY, 0);
  });
}

async function moveCursor(page: Page): Promise<void> {
  const surface = page.getByTestId('demo-canvas-surface');
  const box = await surface.boundingBox();
  if (!box) {
    throw new Error('Canvas surface did not render.');
  }

  await page.bringToFront();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.3);
}

test.describe('live demo app', () => {
  let relayServer: RelayServer | null = null;
  let relayUrl = '';

  test.beforeEach(async () => {
    const port = await reserveRelayPort();
    relayServer = createRelayServer({
      host: '127.0.0.1',
      port,
    });
    await relayServer.start();
    relayUrl = `ws://127.0.0.1:${port}`;
  });

  test.afterEach(async () => {
    await relayServer?.stop();
    relayServer = null;
  });

  test('shares strokes and cursors live with late joiners', async ({ browser }) => {
    const roomQuery = '?room=demo-integrationroom';

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const lateContext = await browser.newContext();

    await seedIdentity(contextA, 'Ada Orbit', '#ff6b35');
    await seedIdentity(contextB, 'Nora Signal', '#1ea896');
    await seedIdentity(lateContext, 'Late Visitor', '#3a86ff');

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const latePage = await lateContext.newPage();

    await openDemo(pageA, relayUrl, roomQuery);
    await openDemo(pageB, relayUrl, roomQuery);

    await expect(pageA.getByTestId('presence-count-value')).toHaveText('2');
    await expect(pageB.getByTestId('presence-count-value')).toHaveText('2');

    await drawStroke(pageA);
    await moveCursor(pageA);

    await expect(pageB.getByTestId('stroke-count-value')).toHaveText('1');
    await expect(pageB.locator('[data-roomful-peer-cursor-label="true"]')).toContainText([
      'Ada Orbit',
    ]);

    await openDemo(latePage, relayUrl, roomQuery);

    await expect(latePage.getByTestId('presence-count-value')).toHaveText('3');
    await expect(latePage.getByTestId('stroke-count-value')).toHaveText('1');

    await contextA.close();
    await contextB.close();
    await lateContext.close();
  });

  test('supports touch drawing interactions', async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { height: 932, width: 430 },
    });
    await seedIdentity(context, 'Touch Sketch', '#5f0f40');

    const page = await context.newPage();
    await openDemo(page, relayUrl, '?room=playwright-touch-room');

    await dispatchTouchStroke(page);

    await expect(page.getByTestId('stroke-count-value')).toHaveText('1');

    await context.close();
  });

  test('keeps each UTC day in a separate public room', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    await seedIdentity(contextA, 'March Ten', '#ff6b35');
    await seedIdentity(contextB, 'March Eleven', '#1ea896');

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await openDemo(pageA, relayUrl, '?day=2026-03-10');
    await drawStroke(pageA);
    await expect(pageA.getByTestId('stroke-count-value')).toHaveText('1');

    await openDemo(pageB, relayUrl, '?day=2026-03-11');
    await expect(pageB.getByTestId('stroke-count-value')).toHaveText('0');

    await contextA.close();
    await contextB.close();
  });
});
