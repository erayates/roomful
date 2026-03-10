import type { DevtoolsCommandResult, DevtoolsRoomSnapshot, DevtoolsRoomSummary } from '../types';

export type SupportedExtensionBrowser = 'chrome' | 'firefox';

export type DevtoolsBridgeReadStatus = 'ready' | 'missing' | 'version-mismatch' | 'error';
export type DevtoolsPanelStatus = DevtoolsBridgeReadStatus | 'loading';

export interface EvalExceptionInfo {
  readonly description?: string;
  readonly isError?: boolean;
  readonly value?: unknown;
}

export interface ExtensionInspectedWindowApi {
  eval(
    expression: string,
    callback: (result: unknown, exceptionInfo?: EvalExceptionInfo) => void,
  ): Promise<unknown> | void;
}

export interface ExtensionPanelsApi {
  create(
    title: string,
    iconPath: string,
    pagePath: string,
    callback?: () => void,
  ): Promise<unknown> | void;
}

export interface ExtensionDevtoolsApi {
  readonly inspectedWindow: ExtensionInspectedWindowApi;
  readonly panels: ExtensionPanelsApi;
}

export interface ExtensionBrowserApi {
  readonly devtools?: ExtensionDevtoolsApi;
}

export interface DevtoolsBridgeReadResult {
  readonly error: string | null;
  readonly rooms: DevtoolsRoomSummary[];
  readonly status: DevtoolsBridgeReadStatus;
  readonly version: number | null;
}

export interface DevtoolsBridgeSnapshotResult {
  readonly error: string | null;
  readonly snapshot: DevtoolsRoomSnapshot | null;
}

export interface DevtoolsBridgeClient {
  disconnectSimulatedPeer(instanceId: string): Promise<DevtoolsCommandResult>;
  injectSimulatedPeer(instanceId: string): Promise<DevtoolsCommandResult>;
  readRooms(): Promise<DevtoolsBridgeReadResult>;
  readSnapshot(instanceId: string): Promise<DevtoolsBridgeSnapshotResult>;
}

export interface DevtoolsPanelState {
  readonly commandPending: boolean;
  readonly error: string | null;
  readonly lastUpdatedAt: number | null;
  readonly rooms: DevtoolsRoomSummary[];
  readonly selectedInstanceId: string | null;
  readonly snapshot: DevtoolsRoomSnapshot | null;
  readonly status: DevtoolsPanelStatus;
  readonly version: number | null;
}

export interface DevtoolsPanelActions {
  onRefresh(): void;
  onSelectRoom(instanceId: string): void;
  onToggleSimulatedPeer(): void;
}

export interface DevtoolsPanelController {
  start(): Promise<void>;
  stop(): void;
}
