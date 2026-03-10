import { DEVTOOLS_BRIDGE_GLOBAL, DEVTOOLS_BRIDGE_VERSION } from '../constants';
import { isDevtoolsRoomSnapshot, isDevtoolsRoomSummary } from '../guards';
import type { DevtoolsCommandResult, DevtoolsRoomSummary } from '../types';
import type {
  DevtoolsBridgeClient,
  DevtoolsBridgeReadResult,
  EvalExceptionInfo,
  ExtensionDevtoolsApi,
} from './types.js';

interface EvalFailureResult {
  readonly error: string;
  readonly ok: false;
}

interface EvalSuccessResult {
  readonly ok: true;
  readonly value: unknown;
}

type EvalResult = EvalFailureResult | EvalSuccessResult;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isObject(value) && typeof value.then === 'function';
}

function readErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  if (isObject(error)) {
    const message = Reflect.get(error, 'message');
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return 'Unknown DevTools bridge failure.';
}

function readExceptionMessage(exceptionInfo: EvalExceptionInfo | undefined): string {
  if (!exceptionInfo) {
    return 'Unknown DevTools bridge failure.';
  }

  if (typeof exceptionInfo.description === 'string' && exceptionInfo.description.length > 0) {
    return exceptionInfo.description;
  }

  return readErrorMessage(exceptionInfo.value);
}

function readCommandResult(value: unknown): DevtoolsCommandResult {
  if (!isObject(value)) {
    return {
      error: 'Page bridge returned an invalid command result.',
      ok: false,
    };
  }

  const ok = Reflect.get(value, 'ok');
  const error = Reflect.get(value, 'error');
  if (typeof ok !== 'boolean') {
    return {
      error: 'Page bridge returned an invalid command result.',
      ok: false,
    };
  }

  if (error !== undefined && typeof error !== 'string') {
    return {
      error: 'Page bridge returned an invalid command result.',
      ok: false,
    };
  }

  return error === undefined ? { ok } : { error, ok };
}

function readRoomsPayload(value: unknown): DevtoolsBridgeReadResult | null {
  if (!isObject(value)) {
    return null;
  }

  const available = Reflect.get(value, 'available');
  const rooms = Reflect.get(value, 'rooms');
  const version = Reflect.get(value, 'version');
  if (
    typeof available !== 'boolean' ||
    !Array.isArray(rooms) ||
    (version !== null && typeof version !== 'number')
  ) {
    return null;
  }

  const validatedRooms: DevtoolsRoomSummary[] = [];
  for (const room of rooms) {
    if (!isDevtoolsRoomSummary(room)) {
      return null;
    }

    validatedRooms.push(room);
  }

  if (!available) {
    return {
      error: null,
      rooms: [],
      status: 'missing',
      version: null,
    };
  }

  if (version !== DEVTOOLS_BRIDGE_VERSION) {
    return {
      error: `Bridge version mismatch. Expected ${String(DEVTOOLS_BRIDGE_VERSION)} but found ${String(version)}.`,
      rooms: validatedRooms,
      status: 'version-mismatch',
      version,
    };
  }

  return {
    error: null,
    rooms: validatedRooms,
    status: 'ready',
    version,
  };
}

async function evaluateExpression(
  devtoolsApi: ExtensionDevtoolsApi,
  expression: string,
): Promise<EvalResult> {
  return new Promise<EvalResult>((resolve) => {
    let settled = false;

    const finish = (result: EvalResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    const callback = (value: unknown, exceptionInfo?: EvalExceptionInfo): void => {
      if (exceptionInfo?.isError) {
        finish({
          error: readExceptionMessage(exceptionInfo),
          ok: false,
        });
        return;
      }

      finish({
        ok: true,
        value,
      });
    };

    try {
      const maybePromise = devtoolsApi.inspectedWindow.eval(expression, callback);
      if (isPromiseLike(maybePromise)) {
        void maybePromise.then(
          (value) => {
            finish({
              ok: true,
              value,
            });
          },
          (error: unknown) => {
            finish({
              error: readErrorMessage(error),
              ok: false,
            });
          },
        );
      }
    } catch (error) {
      finish({
        error: readErrorMessage(error),
        ok: false,
      });
    }
  });
}

function createRoomsExpression(): string {
  return `(() => {
    const bridge = globalThis.window?.${DEVTOOLS_BRIDGE_GLOBAL};
    if (!bridge) {
      return { available: false, version: null, rooms: [] };
    }

    return {
      available: true,
      rooms: typeof bridge.listRooms === 'function' ? bridge.listRooms() : [],
      version: typeof bridge.version === 'number' ? bridge.version : null,
    };
  })()`;
}

function createSnapshotExpression(instanceId: string): string {
  const serializedInstanceId = JSON.stringify(instanceId);
  return `(() => {
    const bridge = globalThis.window?.${DEVTOOLS_BRIDGE_GLOBAL};
    if (!bridge || typeof bridge.getSnapshot !== 'function') {
      return null;
    }

    return bridge.getSnapshot(${serializedInstanceId});
  })()`;
}

function createCommandExpression(
  methodName: 'injectSimulatedPeer' | 'disconnectSimulatedPeer',
  instanceId: string,
): string {
  const serializedInstanceId = JSON.stringify(instanceId);
  return `(() => {
    const bridge = globalThis.window?.${DEVTOOLS_BRIDGE_GLOBAL};
    if (!bridge || typeof bridge.${methodName} !== 'function') {
      return { ok: false, error: 'DevTools bridge is unavailable.' };
    }

    return bridge.${methodName}(${serializedInstanceId});
  })()`;
}

async function runCommand(
  devtoolsApi: ExtensionDevtoolsApi | null,
  methodName: 'injectSimulatedPeer' | 'disconnectSimulatedPeer',
  instanceId: string,
): Promise<DevtoolsCommandResult> {
  if (!devtoolsApi) {
    return {
      error: 'DevTools API is unavailable in this panel runtime.',
      ok: false,
    };
  }

  const evaluation = await evaluateExpression(
    devtoolsApi,
    createCommandExpression(methodName, instanceId),
  );
  if (!evaluation.ok) {
    return {
      error: evaluation.error,
      ok: false,
    };
  }

  return readCommandResult(evaluation.value);
}

export function createInspectedPageBridgeClient(
  devtoolsApi: ExtensionDevtoolsApi | null,
): DevtoolsBridgeClient {
  return {
    disconnectSimulatedPeer(instanceId) {
      return runCommand(devtoolsApi, 'disconnectSimulatedPeer', instanceId);
    },
    injectSimulatedPeer(instanceId) {
      return runCommand(devtoolsApi, 'injectSimulatedPeer', instanceId);
    },
    async readRooms() {
      if (!devtoolsApi) {
        return {
          error: 'DevTools API is unavailable in this panel runtime.',
          rooms: [],
          status: 'error',
          version: null,
        };
      }

      const evaluation = await evaluateExpression(devtoolsApi, createRoomsExpression());
      if (!evaluation.ok) {
        return {
          error: evaluation.error,
          rooms: [],
          status: 'error',
          version: null,
        };
      }

      const payload = readRoomsPayload(evaluation.value);
      if (!payload) {
        return {
          error: 'Page bridge returned an invalid room listing payload.',
          rooms: [],
          status: 'error',
          version: null,
        };
      }

      return payload;
    },
    async readSnapshot(instanceId) {
      if (!devtoolsApi) {
        return {
          error: 'DevTools API is unavailable in this panel runtime.',
          snapshot: null,
        };
      }

      const evaluation = await evaluateExpression(
        devtoolsApi,
        createSnapshotExpression(instanceId),
      );
      if (!evaluation.ok) {
        return {
          error: evaluation.error,
          snapshot: null,
        };
      }

      if (evaluation.value === null) {
        return {
          error: null,
          snapshot: null,
        };
      }

      if (!isDevtoolsRoomSnapshot(evaluation.value)) {
        return {
          error: 'Page bridge returned an invalid room snapshot.',
          snapshot: null,
        };
      }

      return {
        error: null,
        snapshot: evaluation.value,
      };
    },
  };
}
