import type { DebugOptions } from '../types';

const DEBUG_CATEGORIES = ['transport', 'state', 'presence', 'events', 'performance'] as const;

type ConsoleMethod = (message?: unknown, ...optionalParams: unknown[]) => void;
type LogLevel = 'info' | 'warn' | 'error';

export type DebugCategory = (typeof DEBUG_CATEGORIES)[number];
export type ResolvedDebugOptions = Record<DebugCategory, boolean>;

export interface StructuredLogger {
  readonly productionInfoSuppressed: boolean;
  readonly resolvedDebug: ResolvedDebugOptions;

  info(
    category: DebugCategory,
    component: string,
    message: string,
    details?: Record<string, unknown>,
  ): void;
  warn(
    category: DebugCategory,
    component: string,
    message: string,
    details?: Record<string, unknown>,
  ): void;
  error(
    category: DebugCategory,
    component: string,
    message: string,
    details?: Record<string, unknown>,
  ): void;
}

interface StructuredLoggerConfig {
  roomId: string;
  debug: boolean | DebugOptions | undefined;
}

function createDisabledDebugOptions(): ResolvedDebugOptions {
  return {
    transport: false,
    state: false,
    presence: false,
    events: false,
    performance: false,
  };
}

function readNodeEnv(): string | null {
  const globalValue = globalThis as Record<string, unknown>;
  const processValue = globalValue.process;
  if (typeof processValue !== 'object' || processValue === null) {
    return null;
  }

  const envValue = Reflect.get(processValue, 'env');
  if (typeof envValue !== 'object' || envValue === null) {
    return null;
  }

  const nodeEnv = Reflect.get(envValue, 'NODE_ENV');
  return typeof nodeEnv === 'string' ? nodeEnv : null;
}

function getConsoleMethod(level: LogLevel): ConsoleMethod | null {
  const consoleLike = globalThis.console as Partial<Record<LogLevel, ConsoleMethod>> | undefined;
  if (!consoleLike) {
    return null;
  }

  const method = consoleLike[level];
  return typeof method === 'function' ? method.bind(globalThis.console) : null;
}

export function resolveDebugOptions(
  debug: boolean | DebugOptions | undefined,
): ResolvedDebugOptions {
  if (debug === true) {
    return {
      transport: true,
      state: true,
      presence: true,
      events: true,
      performance: true,
    };
  }

  if (!debug || typeof debug !== 'object') {
    return createDisabledDebugOptions();
  }

  const resolved = createDisabledDebugOptions();
  for (const category of DEBUG_CATEGORIES) {
    resolved[category] = debug[category] === true;
  }

  return resolved;
}

export function isProductionInfoSuppressed(): boolean {
  return readNodeEnv() === 'production';
}

export function createStructuredLogger(config: StructuredLoggerConfig): StructuredLogger {
  const resolvedDebug = resolveDebugOptions(config.debug);
  const productionInfoSuppressed = isProductionInfoSuppressed();

  const emit = (
    level: LogLevel,
    category: DebugCategory,
    component: string,
    message: string,
    details?: Record<string, unknown>,
  ): void => {
    if (!resolvedDebug[category]) {
      return;
    }

    if (level === 'info' && productionInfoSuppressed) {
      return;
    }

    const log = getConsoleMethod(level);
    if (!log) {
      return;
    }

    const payload = {
      ...(details ?? {}),
      timestamp: Date.now(),
      roomId: config.roomId,
      category,
      component,
      message,
    };

    log(`[FlockJS] ${component}: ${message}`, payload);
  };

  return {
    productionInfoSuppressed,
    resolvedDebug,
    info(category, component, message, details) {
      emit('info', category, component, message, details);
    },
    warn(category, component, message, details) {
      emit('warn', category, component, message, details);
    },
    error(category, component, message, details) {
      emit('error', category, component, message, details);
    },
  };
}
