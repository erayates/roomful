import { defineConfig } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './apps/demo/integration',
  testMatch: '**/*.test.ts',
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
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @flockjs/app-demo dev --host 127.0.0.1 --port 4174',
    port: 4174,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
