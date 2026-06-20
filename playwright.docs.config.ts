import { defineConfig, devices } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:4322';

export default defineConfig({
  testDir: './apps/docs/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 20_000,
  },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: baseUrl,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: {
          width: 1440,
          height: 960,
        },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @cahoots/app-docs exec astro preview --host 127.0.0.1 --port 4322',
    port: 4322,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
