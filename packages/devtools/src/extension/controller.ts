import { renderDevtoolsPanel } from './render.js';
import type { DevtoolsBridgeClient, DevtoolsPanelActions } from './types.js';
import type { DevtoolsPanelController, DevtoolsPanelState } from './types.js';

interface DevtoolsPanelControllerOptions {
  readonly client: DevtoolsBridgeClient;
  readonly pollIntervalMs: number;
  readonly root: HTMLElement;
}

function createInitialState(): DevtoolsPanelState {
  return {
    commandPending: false,
    error: null,
    lastUpdatedAt: null,
    rooms: [],
    selectedInstanceId: null,
    snapshot: null,
    status: 'loading',
    version: null,
  };
}

function resolveSelectedInstanceId(
  previousSelection: string | null,
  nextRooms: DevtoolsPanelState['rooms'],
): string | null {
  if (nextRooms.length === 0) {
    return null;
  }

  if (previousSelection) {
    const matchedRoom = nextRooms.find((room) => {
      return room.instanceId === previousSelection;
    });
    if (matchedRoom) {
      return matchedRoom.instanceId;
    }
  }

  return nextRooms[0]?.instanceId ?? null;
}

class DevtoolsPanelControllerImpl implements DevtoolsPanelController {
  private intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;

  private refreshSequence = 0;

  private state = createInitialState();

  private stopped = false;

  private readonly actions: DevtoolsPanelActions = {
    onRefresh: () => {
      void this.refresh();
    },
    onSelectRoom: (instanceId: string) => {
      this.state = {
        ...this.state,
        selectedInstanceId: instanceId,
      };
      this.render();
      void this.refresh();
    },
    onToggleSimulatedPeer: () => {
      void this.toggleSimulatedPeer();
    },
  };

  public constructor(private readonly options: DevtoolsPanelControllerOptions) {}

  public async start(): Promise<void> {
    this.stopped = false;
    this.render();
    await this.refresh();

    if (this.intervalHandle !== null) {
      return;
    }

    this.intervalHandle = globalThis.setInterval(() => {
      void this.refresh();
    }, this.options.pollIntervalMs);
  }

  public stop(): void {
    this.stopped = true;
    if (this.intervalHandle !== null) {
      globalThis.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private render(): void {
    renderDevtoolsPanel(this.options.root, this.state, this.actions);
  }

  private setState(nextState: DevtoolsPanelState): void {
    this.state = nextState;
    this.render();
  }

  private isStale(sequence: number): boolean {
    return this.stopped || sequence !== this.refreshSequence;
  }

  private async refresh(): Promise<void> {
    const currentSequence = this.refreshSequence + 1;
    this.refreshSequence = currentSequence;

    const roomsResult = await this.options.client.readRooms();
    if (this.isStale(currentSequence)) {
      return;
    }

    if (roomsResult.status !== 'ready') {
      this.setState({
        ...this.state,
        commandPending: false,
        error: roomsResult.error,
        lastUpdatedAt: Date.now(),
        rooms: roomsResult.rooms,
        selectedInstanceId: null,
        snapshot: null,
        status: roomsResult.status,
        version: roomsResult.version,
      });
      return;
    }

    const selectedInstanceId = resolveSelectedInstanceId(
      this.state.selectedInstanceId,
      roomsResult.rooms,
    );

    if (selectedInstanceId === null) {
      this.setState({
        ...this.state,
        commandPending: false,
        error: roomsResult.error,
        lastUpdatedAt: Date.now(),
        rooms: roomsResult.rooms,
        selectedInstanceId,
        snapshot: null,
        status: 'ready',
        version: roomsResult.version,
      });
      return;
    }

    const snapshotResult = await this.options.client.readSnapshot(selectedInstanceId);
    if (this.isStale(currentSequence)) {
      return;
    }

    this.setState({
      ...this.state,
      commandPending: false,
      error: snapshotResult.error ?? roomsResult.error,
      lastUpdatedAt: Date.now(),
      rooms: roomsResult.rooms,
      selectedInstanceId,
      snapshot: snapshotResult.snapshot,
      status: 'ready',
      version: roomsResult.version,
    });
  }

  private async toggleSimulatedPeer(): Promise<void> {
    if (!this.state.snapshot || this.state.commandPending) {
      return;
    }

    this.setState({
      ...this.state,
      commandPending: true,
      error: null,
    });

    const result = this.state.snapshot.hasSimulatedPeer
      ? await this.options.client.disconnectSimulatedPeer(this.state.snapshot.instanceId)
      : await this.options.client.injectSimulatedPeer(this.state.snapshot.instanceId);

    if (!result.ok) {
      this.setState({
        ...this.state,
        commandPending: false,
        error: result.error ?? 'The bridge command failed.',
      });
      return;
    }

    await this.refresh();
  }
}

export function createDevtoolsPanelController(
  options: DevtoolsPanelControllerOptions,
): DevtoolsPanelController {
  return new DevtoolsPanelControllerImpl(options);
}
