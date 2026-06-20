import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement } from 'react';
import { fn } from 'storybook/test';

import { PresenceAvatars, type PresenceAvatarsProps } from '../src';
import { PresenceStoryHarness } from './presence-story-harness';
import type { StoryPresence } from './story-fixtures';
import { StoryGrid, StorySurface } from './story-layout';

interface PresenceAvatarsStoryArgs extends PresenceAvatarsProps<StoryPresence> {
  peerCount: number;
}

const meta = {
  title: '@roomful/cursors/PresenceAvatars',
  tags: ['autodocs'],
  args: {
    maxVisible: 4,
    onUserClick: fn(),
    peerCount: 6,
    size: 'md',
  },
  argTypes: {
    maxVisible: {
      control: { type: 'range', min: 1, max: 6, step: 1 },
    },
    peerCount: {
      control: { type: 'range', min: 1, max: 8, step: 1 },
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
          background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
          height: 180,
          width: 360,
        },
        createElement(PresenceAvatars, {
          ...(args.maxVisible === undefined ? {} : { maxVisible: args.maxVisible }),
          ...(args.onUserClick === undefined ? {} : { onUserClick: args.onUserClick }),
          ...(args.size === undefined ? {} : { size: args.size }),
        }),
      ),
    );
  },
} satisfies Meta<PresenceAvatarsStoryArgs>;

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
      {
        columns: 3,
      },
      ...(['sm', 'md', 'lg'] as const).map((size) => {
        return createElement(
          PresenceStoryHarness,
          {
            key: size,
            peerCount: 5,
          },
          createElement(
            StorySurface,
            {
              height: 180,
              width: 220,
            },
            createElement(PresenceAvatars, {
              maxVisible: 4,
              onUserClick: fn(),
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
    peerCount: 8,
  },
};
