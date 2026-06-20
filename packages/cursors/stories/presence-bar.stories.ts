import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement } from 'react';
import { fn } from 'storybook/test';

import { PresenceBar, type PresenceBarProps } from '../src';
import { PresenceStoryHarness } from './presence-story-harness';
import type { StoryPresence } from './story-fixtures';
import { StoryGrid, StorySurface } from './story-layout';

interface PresenceBarStoryArgs extends PresenceBarProps<StoryPresence> {
  peerCount: number;
}

const meta = {
  title: '@roomful/cursors/PresenceBar',
  tags: ['autodocs'],
  args: {
    maxVisible: 4,
    onUserClick: fn(),
    peerCount: 5,
    showNames: true,
    size: 'md',
  },
  argTypes: {
    maxVisible: {
      control: { type: 'range', min: 1, max: 6, step: 1 },
    },
    peerCount: {
      control: { type: 'range', min: 1, max: 8, step: 1 },
    },
    showNames: {
      control: 'boolean',
    },
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
  },
  render: (args) => {
    return createElement(
      PresenceStoryHarness,
      {
        peerCount: args.peerCount,
      },
      createElement(
        StorySurface,
        {
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          height: 220,
          width: 620,
        },
        createElement(PresenceBar, {
          ...(args.maxVisible === undefined ? {} : { maxVisible: args.maxVisible }),
          ...(args.onUserClick === undefined ? {} : { onUserClick: args.onUserClick }),
          ...(args.showNames === undefined ? {} : { showNames: args.showNames }),
          ...(args.size === undefined ? {} : { size: args.size }),
        }),
      ),
    );
  },
} satisfies Meta<PresenceBarStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {},
};

export const SizeVariants: Story = {
  args: {},
  render: () => {
    return createElement(
      StoryGrid,
      null,
      ...(['sm', 'md', 'lg'] as const).map((size) => {
        return createElement(
          PresenceStoryHarness,
          {
            key: size,
            peerCount: 4,
          },
          createElement(
            StorySurface,
            {
              height: 180,
              width: 320,
            },
            createElement(PresenceBar, {
              maxVisible: 4,
              onUserClick: fn(),
              showNames: true,
              size,
            }),
          ),
        );
      }),
    );
  },
};

export const OverflowState: Story = {
  args: {
    maxVisible: 3,
    peerCount: 7,
  },
};
