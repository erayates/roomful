import { mergeConfig } from 'vitest/config';

import packageConfig from '../../vitest.package.config';

export default mergeConfig(packageConfig, {
  test: {
    environment: 'node',
  },
});
