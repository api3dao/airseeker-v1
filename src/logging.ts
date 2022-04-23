import { logger as airnodeLogger } from '@api3/airnode-utilities';
import { getState } from './state';

const debug = (message: string) => airnodeLogger.debug(message, getState().logOptions);
const error = (message: string) => airnodeLogger.error(message, getState().logOptions);
const info = (message: string) => airnodeLogger.info(message, getState().logOptions);
const log = (message: string) => airnodeLogger.log(message, getState().logOptions);
const warn = (message: string) => airnodeLogger.warn(message, getState().logOptions);

export const logger = {
  debug,
  error,
  info,
  log,
  warn,
};
