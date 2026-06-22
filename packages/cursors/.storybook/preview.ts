import type { Preview } from '@storybook/react-vite';

import { roomfulTheme } from './theme';

const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        dark: { name: 'Roomful dark', value: '#0e1413' },
        cream: { name: 'Roomful cream', value: '#f7f5ee' },
      },
    },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      canvas: {
        sourceState: 'shown',
      },
      theme: roomfulTheme,
    },
    layout: 'centered',
  },
  initialGlobals: {
    backgrounds: { value: 'dark' },
  },
};

export default preview;
