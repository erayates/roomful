import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement } from 'react';

import { PeerCursor, type PeerCursorProps } from '../src';
import { StoryGrid, StorySurface } from './story-layout';

const meta = {
  title: '@flockjs/cursors/PeerCursor',
  component: PeerCursor,
  tags: ['autodocs'],
  args: {
    color: '#2563eb',
    idle: false,
    name: 'Ada Lovelace',
    style: 'arrow',
    x: 0.36,
    y: 0.42,
  },
  argTypes: {
    color: {
      control: 'color',
    },
    idle: {
      control: 'boolean',
    },
    name: {
      control: 'text',
    },
    style: {
      control: 'inline-radio',
      options: ['arrow', 'dot', 'pointer'],
    },
    x: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    y: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
  },
  render: (args) => {
    return createElement(
      StorySurface,
      {
        background: 'linear-gradient(135deg, #f8fafc 0%, #dbeafe 100%)',
        height: 260,
      },
      createElement(PeerCursor, args),
    );
  },
} satisfies Meta<PeerCursorProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const StyleVariants: Story = {
  render: () => {
    return createElement(
      StoryGrid,
      {
        columns: 3,
      },
      createElement(
        StorySurface,
        {
          height: 220,
          width: 240,
        },
        createElement(PeerCursor, {
          color: '#2563eb',
          idle: false,
          name: 'Arrow',
          style: 'arrow',
          x: 0.44,
          y: 0.45,
        }),
      ),
      createElement(
        StorySurface,
        {
          height: 220,
          width: 240,
        },
        createElement(PeerCursor, {
          color: '#0f766e',
          idle: false,
          name: 'Dot',
          style: 'dot',
          x: 0.5,
          y: 0.5,
        }),
      ),
      createElement(
        StorySurface,
        {
          height: 220,
          width: 240,
        },
        createElement(PeerCursor, {
          color: '#d97706',
          idle: false,
          name: 'Pointer',
          style: 'pointer',
          x: 0.5,
          y: 0.48,
        }),
      ),
    );
  },
};

export const IdleState: Story = {
  args: {
    idle: true,
  },
};
