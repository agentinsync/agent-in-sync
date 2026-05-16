import { getAxiomClient, getDataset, isAxiomEnabled } from './axiom.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

type LogEvent = {
  _time: string;
  level: LogLevel;
  message: string;
  service: string;
} & LogContext;

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'agent-in-sync-backend';
const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info') as LogLevel;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[LOG_LEVEL];
}

function formatConsoleMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const contextStr =
    context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
  return `${prefix} ${message}${contextStr}`;
}

function logToConsole(level: LogLevel, message: string, context?: LogContext): void {
  const formatted = formatConsoleMessage(level, message, context);

  switch (level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

function logToAxiom(level: LogLevel, message: string, context?: LogContext): void {
  const client = getAxiomClient();
  if (!client) return;

  const event: LogEvent = {
    _time: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    ...context,
  };

  client.ingest(getDataset(), [event]);
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (!shouldLog('debug')) return;
    logToConsole('debug', message, context);
    logToAxiom('debug', message, context);
  },

  info(message: string, context?: LogContext): void {
    if (!shouldLog('info')) return;
    logToConsole('info', message, context);
    logToAxiom('info', message, context);
  },

  warn(message: string, context?: LogContext): void {
    if (!shouldLog('warn')) return;
    logToConsole('warn', message, context);
    logToAxiom('warn', message, context);
  },

  error(message: string, context?: LogContext): void {
    if (!shouldLog('error')) return;
    logToConsole('error', message, context);
    logToAxiom('error', message, context);
  },

  logError(message: string, error: unknown, context?: LogContext): void {
    const errorContext: LogContext = {
      ...context,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    };
    this.error(message, errorContext);
  },

  isEnabled(): boolean {
    return isAxiomEnabled();
  },
};
