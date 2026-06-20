import { defineConfig } from 'vitest/config';

import baseConfig from './vitest.config';

const baseTest = baseConfig.test ?? {};
const baseCoverage = baseTest.coverage ?? {};

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseTest,
    include: ['src/engines/**/*.test.ts'],
    coverage: {
      ...baseCoverage,
      include: [
        'src/engines/awareness.ts',
        'src/engines/cursors.ts',
        'src/engines/events.ts',
        'src/engines/presence.ts',
        'src/engines/state.ts',
      ],
      thresholds: {
        statements: 100,
        // A few defensive nullish-coalescing fallbacks remain uncovered; enforce
        // a high branch floor rather than an unreachable 100%.
        branches: 98,
        functions: 100,
        lines: 100,
      },
    },
  },
});
