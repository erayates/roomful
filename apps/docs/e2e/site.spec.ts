import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

async function openMobileMenuIfNeeded(page: Page, testInfo: TestInfo) {
  if (!testInfo.project.use.isMobile) {
    return;
  }

  const menuButton = page.getByRole('button', { name: /menu/i });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
}

async function closeMobileMenuIfNeeded(page: Page, testInfo: TestInfo) {
  if (!testInfo.project.use.isMobile) {
    return;
  }

  const menuButton = page.getByRole('button', { name: /menu/i });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
}

async function getVisibleVersionSelect(page: Page, testInfo: TestInfo) {
  if (testInfo.project.use.isMobile) {
    await openMobileMenuIfNeeded(page, testInfo);
    return page.locator('.mobile-preferences [data-version-switcher]').first();
  }

  return page.locator('.flock-toolbar-controls [data-version-switcher]').first();
}

test('docs home exposes navigation, search, theme, and version controls', async ({
  page,
}, testInfo) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Realtime collaboration primitives for product teams/i,
    }),
  ).toBeVisible();

  await expect(page.locator('button[data-open-modal]:visible')).toBeVisible();
  await expect(await getVisibleVersionSelect(page, testInfo)).toBeVisible();
  await expect(page.locator('starlight-theme-select select:visible').first()).toBeVisible();
  await closeMobileMenuIfNeeded(page, testInfo);

  await page.getByRole('link', { name: 'Install FlockJS' }).click();
  await expect(page).toHaveURL(/\/getting-started\/installation\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /Installation/i })).toBeVisible();
});

test('theme toggle and search modal work', async ({ page }, testInfo) => {
  await page.goto('/');

  await openMobileMenuIfNeeded(page, testInfo);
  const themeSelect = page.locator('starlight-theme-select select:visible').first();
  await expect(themeSelect).toBeVisible();
  await themeSelect.selectOption('dark');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('dark');

  if (testInfo.project.use.isMobile) {
    await page.goto('/');
  }

  const searchButton = page.locator('button[data-open-modal]:visible');
  await expect(searchButton).toBeEnabled();
  await searchButton.click();
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
});

test('playground and api reference pages render', async ({ page }) => {
  await page.goto('/playground/');
  await expect(page.getByRole('heading', { level: 1, name: /Interactive Playground/i })).toBeVisible();
  await expect(page.getByLabel('Room ID')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open second tab' })).toBeVisible();

  await page.goto('/api/');
  await expect(page.getByRole('heading', { level: 1, name: /API Reference/i })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: '@flockjs/core', exact: true })).toBeVisible();
});

test('version switcher reaches the v1.0 snapshot', async ({ page }, testInfo) => {
  await page.goto('/getting-started/installation/');

  const versionSelect = await getVisibleVersionSelect(page, testInfo);
  await expect(versionSelect).toBeVisible();
  await versionSelect.selectOption('v1-0');

  await expect(page).toHaveURL(/\/v1-0\/getting-started\/installation\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /Installation/i })).toBeVisible();
});

test('mobile navigation exposes docs links', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'Mobile navigation smoke only applies to mobile.');

  await page.goto('/');
  await openMobileMenuIfNeeded(page, testInfo);

  const installationLink = page.getByRole('link', { name: 'Installation' }).first();
  await expect(installationLink).toBeVisible();
  await installationLink.click();

  await expect(page).toHaveURL(/\/getting-started\/installation\/$/);
});
