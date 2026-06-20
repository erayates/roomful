import { fileURLToPath } from 'node:url';

import { mergeConfig } from 'vitest/config';

import baseConfig from '../../vitest.package.config';

const devtoolsSourcePath = fileURLToPath(new URL('../devtools/src/index.ts', import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      '@cahoots/devtools': devtoolsSourcePath,
    },
  },
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
