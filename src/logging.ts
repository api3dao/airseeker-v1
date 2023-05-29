import {
  logger as airnodeLogger,
  getLogOptions,
  LogLevel,
  LogOptions,
  PendingLog,
  LogsData,
} from '@api3/airnode-utilities';
import merge from 'lodash/merge';

export type LogOptionsOverride = Partial<Pick<LogOptions, 'meta'>>;

const debug = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.debug(message, merge({}, getLogOptions(), logOptionsOverride));
const error = (message: string, error: Error | null = null, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.error(message, error, merge({}, getLogOptions(), logOptionsOverride));
const info = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.info(message, merge({}, getLogOptions(), logOptionsOverride));
const log = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.log(message, merge({}, getLogOptions(), logOptionsOverride));
const warn = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.warn(message, merge({}, getLogOptions(), logOptionsOverride));
const logPending = (pendingLogs: PendingLog[], logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.logPending(pendingLogs, merge({}, getLogOptions(), logOptionsOverride));
const pend = (level: LogLevel, message: string, error?: Error | null) => airnodeLogger.pend(level, message, error);

export { LogsData };

export const logger = {
  debug,
  error,
  info,
  log,
  warn,
  logPending,
  pend,
};
