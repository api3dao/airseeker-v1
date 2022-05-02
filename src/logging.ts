import { logger as airnodeLogger, LogOptions } from '@api3/airnode-utilities';
import merge from 'lodash/merge';
import { getState } from './state';

type LogOptionsOverride = Partial<Pick<LogOptions, 'meta' | 'additional'>>;

const debug = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.debug(message, merge({ ...getState().logOptions }, logOptionsOverride));
const error = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.error(message, merge({ ...getState().logOptions }, logOptionsOverride));
const info = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.info(message, merge({ ...getState().logOptions }, logOptionsOverride));
const log = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.log(message, merge({ ...getState().logOptions }, logOptionsOverride));
const warn = (message: string, logOptionsOverride?: LogOptionsOverride) =>
  airnodeLogger.warn(message, merge({ ...getState().logOptions }, logOptionsOverride));

export const logger = {
  debug,
  error,
  info,
  log,
  warn,
};
