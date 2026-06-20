import type {
  DevtoolsSerializedRecord,
  DevtoolsSerializedValue,
  DevtoolsStateDiffEntry,
  DevtoolsStateSnapshot,
} from '../types';
import { createBadge, createElement, replaceChildren } from './dom.js';
import {
  formatDiffPath,
  formatSerializedValue,
  formatStatus,
  formatTimestamp,
  formatTransport,
  getPeerLabel,
  getSortedRecordEntries,
  toTestIdSegment,
} from './format.js';
import type { DevtoolsPanelActions, DevtoolsPanelState } from './types.js';

function isRecord(value: DevtoolsSerializedValue): value is DevtoolsSerializedRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSelectedRoom(
  state: DevtoolsPanelState,
): NonNullable<DevtoolsPanelState['snapshot']> | DevtoolsPanelState['rooms'][number] | null {
  if (state.snapshot) {
    return state.snapshot;
  }

  if (state.selectedInstanceId === null) {
    return state.rooms[0] ?? null;
  }

  return (
    state.rooms.find((room) => {
      return room.instanceId === state.selectedInstanceId;
    }) ?? null
  );
}

function createSection(title: string, description: string, children: Node[]): HTMLElement {
  return createElement(
    'section',
    {
      className: 'cahoots-section',
    },
    [
      createElement(
        'header',
        {
          className: 'cahoots-section__header',
        },
        [
          createElement('h2', {
            className: 'cahoots-section__title',
            text: title,
          }),
          createElement('p', {
            className: 'cahoots-section__description',
            text: description,
          }),
        ],
      ),
      ...children,
    ],
  );
}

function createMetaCard(label: string, value: string): HTMLElement {
  return createElement(
    'article',
    {
      className: 'cahoots-card cahoots-card--metric',
    },
    [
      createElement('span', {
        className: 'cahoots-card__label',
        text: label,
      }),
      createElement('strong', {
        className: 'cahoots-card__value',
        text: value,
      }),
    ],
  );
}

function createOverviewSection(state: DevtoolsPanelState): HTMLElement {
  const selectedRoom = resolveSelectedRoom(state);
  const snapshot = state.snapshot;
  const peerCount = selectedRoom ? String(selectedRoom.peerCount) : '0';

  return createSection('Overview', 'Room status, transport, and identifiers.', [
    createElement(
      'div',
      {
        className: 'cahoots-grid cahoots-grid--metrics',
      },
      [
        createMetaCard('Status', selectedRoom ? formatStatus(selectedRoom.status) : 'n/a'),
        createMetaCard('Transport', selectedRoom ? formatTransport(selectedRoom.transport) : 'n/a'),
        createMetaCard('Remote Peers', peerCount),
        createMetaCard('Last Update', formatTimestamp(state.lastUpdatedAt)),
      ],
    ),
    createElement(
      'div',
      {
        className: 'cahoots-grid cahoots-grid--details',
      },
      [
        createMetaCard('Room ID', selectedRoom?.roomId ?? 'n/a'),
        createMetaCard('Local Peer', selectedRoom?.peerId ?? 'n/a'),
        createMetaCard(
          'State',
          snapshot?.state.available ? (snapshot.state.strategy ?? 'configured') : 'not configured',
        ),
        createMetaCard('Simulated Peer', snapshot?.hasSimulatedPeer ? 'connected' : 'inactive'),
      ],
    ),
  ]);
}

function createPeerCard(
  peer: NonNullable<DevtoolsPanelState['snapshot']>['peers'][number],
): HTMLElement {
  const badges: Node[] = [];
  if (peer.isSelf) {
    badges.push(createBadge('self', 'accent'));
  }
  if (peer.isSimulated) {
    badges.push(createBadge('simulated', 'warm'));
  }

  const presenceEntries = getSortedRecordEntries(peer.presence);

  return createElement(
    'article',
    {
      className: 'cahoots-card cahoots-peer-card',
    },
    [
      createElement(
        'header',
        {
          className: 'cahoots-peer-card__header',
        },
        [
          createElement(
            'div',
            {
              className: 'cahoots-peer-card__identity',
            },
            [
              createElement('strong', {
                className: 'cahoots-peer-card__name',
                text: getPeerLabel(peer.presence, peer.id),
              }),
              createElement('span', {
                className: 'cahoots-peer-card__meta',
                text: peer.id,
              }),
            ],
          ),
          createElement(
            'div',
            {
              className: 'cahoots-badge-row',
            },
            badges,
          ),
        ],
      ),
      createElement(
        'dl',
        {
          className: 'cahoots-definition-list',
        },
        presenceEntries.flatMap(([key, value]) => {
          return [
            createElement('dt', {
              text: key,
            }),
            createElement('dd', {
              text: formatSerializedValue(value),
            }),
          ];
        }),
      ),
    ],
  );
}

function createPeersSection(state: DevtoolsPanelState): HTMLElement {
  const peers = state.snapshot?.peers ?? [];

  return createSection('Connected Peers', 'Live presence snapshots for every visible peer.', [
    peers.length > 0
      ? createElement(
          'div',
          {
            className: 'cahoots-grid cahoots-grid--peers',
          },
          peers.map((peer) => {
            return createPeerCard(peer);
          }),
        )
      : createElement('p', {
          className: 'cahoots-empty-copy',
          text: 'No peer data is available for the selected room.',
        }),
  ]);
}

function createDiffList(state: DevtoolsStateSnapshot): HTMLElement {
  if (state.diff.length === 0) {
    return createElement('p', {
      className: 'cahoots-empty-copy',
      text: 'No state changes recorded yet.',
    });
  }

  return createElement(
    'ul',
    {
      className: 'cahoots-list cahoots-list--diff',
    },
    state.diff.map((entry) => {
      return createElement(
        'li',
        {
          attributes: {
            'data-diff-kind': entry.kind,
          },
          className: 'cahoots-diff-entry',
        },
        [
          createElement(
            'div',
            {
              className: 'cahoots-diff-entry__header',
            },
            [
              createElement('strong', {
                text: formatDiffPath(entry.path),
              }),
              createBadge(entry.kind, entry.kind),
            ],
          ),
          createElement('p', {
            className: 'cahoots-diff-entry__values',
            text: `${formatSerializedValue(entry.previous)} \u2192 ${formatSerializedValue(entry.next)}`,
          }),
        ],
      );
    }),
  );
}

function buildDiffLookup(
  entries: readonly DevtoolsStateDiffEntry[],
): Map<string, DevtoolsStateDiffEntry['kind']> {
  const lookup = new Map<string, DevtoolsStateDiffEntry['kind']>();
  for (const entry of entries) {
    lookup.set(entry.path, entry.kind);
  }

  return lookup;
}

function renderStateNode(
  label: string,
  value: DevtoolsSerializedValue,
  path: string,
  diffLookup: Map<string, DevtoolsStateDiffEntry['kind']>,
  depth: number,
): HTMLElement {
  const diffKind = diffLookup.get(path);
  const attributes = {
    'data-diff-kind': diffKind,
    'data-testid': `state-node-${toTestIdSegment(path)}`,
  };

  if (!isRecord(value) && !Array.isArray(value)) {
    return createElement(
      'div',
      {
        attributes,
        className: 'cahoots-state-row',
      },
      [
        createElement('span', {
          className: 'cahoots-state-row__key',
          text: label,
        }),
        createElement('code', {
          className: 'cahoots-state-row__value',
          text: formatSerializedValue(value),
        }),
      ],
    );
  }

  const detailElement = createElement(
    'details',
    {
      attributes,
      className: 'cahoots-state-branch',
    },
    [],
  );
  detailElement.open = depth < 2;

  const typeLabel = Array.isArray(value) ? `Array(${String(value.length)})` : 'Object';
  detailElement.appendChild(
    createElement(
      'summary',
      {
        className: 'cahoots-state-branch__summary',
      },
      [
        createElement('span', {
          className: 'cahoots-state-branch__key',
          text: label,
        }),
        createElement('span', {
          className: 'cahoots-state-branch__type',
          text: typeLabel,
        }),
        diffKind ? createBadge(diffKind, diffKind) : null,
      ],
    ),
  );

  const childNodes = Array.isArray(value)
    ? value.map((entry, index) => {
        const childPath = path.length > 0 ? `${path}.${String(index)}` : String(index);
        return renderStateNode(String(index), entry, childPath, diffLookup, depth + 1);
      })
    : Object.entries(value)
        .sort(([left], [right]) => {
          return left.localeCompare(right);
        })
        .map(([key, childValue]) => {
          const childPath = path.length > 0 ? `${path}.${key}` : key;
          return renderStateNode(key, childValue, childPath, diffLookup, depth + 1);
        });

  detailElement.appendChild(
    createElement(
      'div',
      {
        className: 'cahoots-state-branch__children',
      },
      childNodes,
    ),
  );

  return detailElement;
}

function createStateSection(state: DevtoolsPanelState): HTMLElement {
  const stateSnapshot = state.snapshot?.state ?? null;

  return createSection('State Inspector', 'Current state plus the most recent diff highlights.', [
    stateSnapshot?.available && stateSnapshot.value !== null
      ? createElement(
          'div',
          {
            className: 'cahoots-grid cahoots-grid--state',
          },
          [
            createElement(
              'div',
              {
                className: 'cahoots-card cahoots-state-card',
              },
              [
                createElement(
                  'div',
                  {
                    className: 'cahoots-inline-metrics',
                  },
                  [
                    createMetaCard('Strategy', stateSnapshot.strategy ?? 'n/a'),
                    createMetaCard('Reason', stateSnapshot.reason ?? 'n/a'),
                    createMetaCard('Changed By', stateSnapshot.lastChangedBy ?? 'n/a'),
                  ],
                ),
                renderStateNode(
                  'root',
                  stateSnapshot.value,
                  '',
                  buildDiffLookup(stateSnapshot.diff),
                  0,
                ),
              ],
            ),
            createElement(
              'div',
              {
                className: 'cahoots-card cahoots-state-card',
              },
              [createDiffList(stateSnapshot)],
            ),
          ],
        )
      : createElement('p', {
          className: 'cahoots-empty-copy',
          text: 'The selected room has not configured shared state.',
        }),
  ]);
}

function createEventCard(
  event: NonNullable<DevtoolsPanelState['snapshot']>['events'][number],
): HTMLElement {
  return createElement(
    'article',
    {
      className: 'cahoots-card cahoots-event-card',
    },
    [
      createElement(
        'div',
        {
          className: 'cahoots-event-card__header',
        },
        [
          createElement(
            'div',
            {
              className: 'cahoots-event-card__identity',
            },
            [
              createElement('strong', {
                text: event.name,
              }),
              createElement('span', {
                className: 'cahoots-event-card__meta',
                text: `${event.direction} \u2022 ${formatTimestamp(event.timestamp)}`,
              }),
            ],
          ),
          createBadge(event.direction, event.direction),
        ],
      ),
      createElement(
        'dl',
        {
          className: 'cahoots-definition-list',
        },
        [
          createElement('dt', {
            text: 'Sender',
          }),
          createElement('dd', {
            text: getPeerLabel(event.sender, event.fromPeerId ?? 'system'),
          }),
          createElement('dt', {
            text: 'From',
          }),
          createElement('dd', {
            text: event.fromPeerId ?? 'n/a',
          }),
          createElement('dt', {
            text: 'To',
          }),
          createElement('dd', {
            text: event.toPeerId ?? 'broadcast',
          }),
          createElement('dt', {
            text: 'Payload',
          }),
          createElement('dd', {
            text: formatSerializedValue(event.payload, 180),
          }),
        ],
      ),
    ],
  );
}

function createEventsSection(state: DevtoolsPanelState): HTMLElement {
  const events = [...(state.snapshot?.events ?? [])].reverse();

  return createSection('Event Log', 'Recent inbound and outbound event traffic.', [
    events.length > 0
      ? createElement(
          'div',
          {
            className: 'cahoots-grid cahoots-grid--events',
          },
          events.map((event) => {
            return createEventCard(event);
          }),
        )
      : createElement('p', {
          className: 'cahoots-empty-copy',
          text: 'No custom events have been recorded yet.',
        }),
  ]);
}

function createControls(state: DevtoolsPanelState, actions: DevtoolsPanelActions): HTMLElement {
  const controls = createElement(
    'div',
    {
      className: 'cahoots-controls',
    },
    [],
  );

  if (state.rooms.length > 1) {
    const selector = createElement(
      'select',
      {
        attributes: {
          'aria-label': 'Select room',
          'data-testid': 'room-selector',
        },
        className: 'cahoots-select',
      },
      state.rooms.map((room) => {
        const option = createElement(
          'option',
          {
            attributes: {
              value: room.instanceId,
            },
            text: `${room.roomId} \u2022 ${room.peerId}`,
          },
          [],
        );
        option.selected = room.instanceId === state.selectedInstanceId;
        return option;
      }),
    );

    selector.addEventListener('change', () => {
      actions.onSelectRoom(selector.value);
    });

    controls.appendChild(
      createElement(
        'label',
        {
          className: 'cahoots-control',
        },
        [
          createElement('span', {
            className: 'cahoots-control__label',
            text: 'Room',
          }),
          selector,
        ],
      ),
    );
  }

  const refreshButton = createElement(
    'button',
    {
      attributes: {
        type: 'button',
      },
      className: 'cahoots-button cahoots-button--secondary',
      text: 'Refresh',
    },
    [],
  );
  refreshButton.addEventListener('click', () => {
    actions.onRefresh();
  });

  const simulatedPeerButton = createElement(
    'button',
    {
      attributes: {
        type: 'button',
      },
      className: 'cahoots-button',
      text: state.snapshot?.hasSimulatedPeer ? 'Remove Simulated Peer' : 'Inject Simulated Peer',
    },
    [],
  );
  simulatedPeerButton.disabled = state.commandPending || state.snapshot === null;
  simulatedPeerButton.addEventListener('click', () => {
    actions.onToggleSimulatedPeer();
  });

  controls.appendChild(
    createElement(
      'div',
      {
        className: 'cahoots-control-row',
      },
      [refreshButton, simulatedPeerButton],
    ),
  );

  return controls;
}

function createCallout(title: string, message: string): HTMLElement {
  return createElement(
    'section',
    {
      className: 'cahoots-callout',
    },
    [
      createElement('h2', {
        className: 'cahoots-callout__title',
        text: title,
      }),
      createElement('p', {
        className: 'cahoots-callout__body',
        text: message,
      }),
    ],
  );
}

function renderReadyState(state: DevtoolsPanelState, actions: DevtoolsPanelActions): HTMLElement[] {
  if (state.rooms.length === 0) {
    return [
      createCallout('No active rooms', 'Create and connect a Cahoots room to inspect live data.'),
    ];
  }

  return [
    createControls(state, actions),
    createOverviewSection(state),
    createPeersSection(state),
    createStateSection(state),
    createEventsSection(state),
  ];
}

export function renderDevtoolsPanel(
  root: HTMLElement,
  state: DevtoolsPanelState,
  actions: DevtoolsPanelActions,
): void {
  const selectedRoom = resolveSelectedRoom(state);
  const container = createElement(
    'main',
    {
      className: 'cahoots-panel',
    },
    [
      createElement(
        'header',
        {
          className: 'cahoots-panel__hero',
        },
        [
          createElement(
            'div',
            {
              className: 'cahoots-panel__hero-copy',
            },
            [
              createElement('p', {
                className: 'cahoots-panel__eyebrow',
                text: 'Cahoots DevTools',
              }),
              createElement('h1', {
                className: 'cahoots-panel__title',
                text: 'Realtime room diagnostics for peers, state, and events.',
              }),
              createElement('p', {
                className: 'cahoots-panel__subtitle',
                text:
                  state.status === 'ready' && selectedRoom
                    ? `${selectedRoom.roomId} \u2022 ${formatTransport(selectedRoom.transport)}`
                    : 'Bridge your inspected page through window.__cahoots_devtools__ to activate live inspection.',
              }),
            ],
          ),
          createElement(
            'div',
            {
              className: 'cahoots-panel__hero-meta',
            },
            [
              createBadge(state.status, state.status),
              createElement('span', {
                className: 'cahoots-panel__timestamp',
                text: `Updated ${formatTimestamp(state.lastUpdatedAt)}`,
              }),
            ],
          ),
        ],
      ),
      state.error ? createCallout('Bridge warning', state.error) : null,
      ...(state.status === 'loading'
        ? [
            createCallout(
              'Connecting',
              'Waiting for the inspected page to expose the Cahoots bridge.',
            ),
          ]
        : state.status === 'missing'
          ? [
              createCallout(
                'SDK not detected',
                'Expose window.__cahoots_devtools__ from the inspected page to populate the Cahoots panel.',
              ),
            ]
          : state.status === 'version-mismatch'
            ? [
                createCallout(
                  'Bridge version mismatch',
                  `The extension expects bridge version 1 but received ${String(state.version)}.`,
                ),
              ]
            : state.status === 'error'
              ? [
                  createCallout(
                    'Bridge error',
                    state.error ?? 'The inspected page bridge could not be read.',
                  ),
                ]
              : renderReadyState(state, actions)),
    ],
  );

  replaceChildren(root, container);
}
