import type { Peer } from '@roomful/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement, type CSSProperties } from 'react';

import { CollaborationBadge, type CollaborationBadgePosition } from '../src';
import { createStoryPeer, type StoryPresence } from './story-fixtures';
import { StoryGrid, StorySurface } from './story-layout';

interface CollaborationBadgeStoryArgs {
  position?: CollaborationBadgePosition;
  color: string;
  name: string;
}

const meta = {
  title: '@roomful/cursors/CollaborationBadge',
  tags: ['autodocs'],
  args: {
    color: '#7c3aed',
    name: 'Grace Hopper',
    position: {
      right: 12,
      top: 12,
    },
  },
  argTypes: {
    color: {
      control: 'color',
    },
    name: {
      control: 'text',
    },
    position: {
      control: 'object',
    },
  },
  render: (args) => {
    return createElement(
      StorySurface,
      {
        background: 'linear-gradient(135deg, #eef2ff 0%, #ffffff 100%)',
        height: 240,
        width: 420,
      },
      createElement(
        'div',
        {
          style: createTargetStyle(),
        },
        createElement(
          'label',
          {
            style: createLabelStyle(),
          },
          'Document title',
        ),
        createElement('input', {
          defaultValue: 'Sprint planning notes',
          style: createInputStyle(),
          type: 'text',
        }),
        createElement(CollaborationBadge, {
          peer: createBadgePeer(args.name, args.color),
          ...(args.position === undefined ? {} : { position: args.position }),
        }),
      ),
    );
  },
} satisfies Meta<CollaborationBadgeStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {},
};

export const PositionPresets: Story = {
  args: {},
  render: () => {
    const positions: readonly CollaborationBadgePosition[] = [
      { right: 12, top: 12 },
      { left: 12, top: 12 },
      { bottom: 12, right: 12 },
      { bottom: 12, left: 12 },
    ];

    return createElement(
      StoryGrid,
      null,
      ...positions.map((position, index) => {
        return createElement(
          StorySurface,
          {
            height: 220,
            key: `${index}`,
            width: 320,
          },
          createElement(
            'div',
            {
              style: createTargetStyle(),
            },
            createElement('textarea', {
              defaultValue: 'A teammate is editing this field.',
              style: createTextareaStyle(),
            }),
            createElement(CollaborationBadge, {
              peer: createStoryPeer(index, {
                color: ['#2563eb', '#0f766e', '#d97706', '#7c3aed'][index] ?? '#2563eb',
              }),
              position,
            }),
          ),
        );
      }),
    );
  },
};

function createBadgePeer(name: string, color: string): Peer<StoryPresence> {
  return createStoryPeer(1, {
    color,
    name,
  });
}

function createTargetStyle(): CSSProperties {
  return {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    borderRadius: '18px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    height: '100%',
    padding: '18px',
    position: 'relative',
    width: '100%',
  };
}

function createLabelStyle(): CSSProperties {
  return {
    color: '#475569',
    fontSize: '12px',
    fontWeight: 700,
  };
}

function createInputStyle(): CSSProperties {
  return {
    border: '1px solid rgba(148, 163, 184, 0.45)',
    borderRadius: '12px',
    color: '#0f172a',
    fontSize: '14px',
    padding: '12px 14px',
  };
}

function createTextareaStyle(): CSSProperties {
  return {
    border: '1px solid rgba(148, 163, 184, 0.45)',
    borderRadius: '14px',
    color: '#0f172a',
    flex: 1,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '14px',
    padding: '14px',
    resize: 'none',
  };
}
