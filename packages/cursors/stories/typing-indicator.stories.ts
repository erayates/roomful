import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement } from 'react';

import { TypingIndicator } from '../src';
import { createTypingPeers } from './story-fixtures';
import { StoryGrid, StorySurface } from './story-layout';

interface TypingIndicatorStoryArgs {
  ariaLabel?: string;
  peerCount: number;
}

const meta = {
  title: '@roomful/cursors/TypingIndicator',
  tags: ['autodocs'],
  args: {
    ariaLabel: 'People currently typing',
    peerCount: 3,
  },
  argTypes: {
    ariaLabel: {
      control: 'text',
    },
    peerCount: {
      control: { type: 'range', min: 0, max: 6, step: 1 },
    },
  },
  render: (args) => {
    return createElement(
      StorySurface,
      {
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        height: 160,
        width: 440,
      },
      createElement(TypingIndicator, {
        peers: createTypingPeers(args.peerCount),
        ...(args.ariaLabel === undefined ? {} : { ariaLabel: args.ariaLabel }),
      }),
    );
  },
} satisfies Meta<TypingIndicatorStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {},
};

export const StateMatrix: Story = {
  args: {},
  render: () => {
    return createElement(
      StoryGrid,
      null,
      ...[0, 1, 3, 5].map((peerCount) => {
        return createElement(
          StorySurface,
          {
            height: 150,
            key: String(peerCount),
            width: 320,
          },
          createElement(TypingIndicator, {
            ariaLabel: `${peerCount} people typing`,
            peers: createTypingPeers(peerCount),
          }),
        );
      }),
    );
  },
};
