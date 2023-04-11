import * as path from 'path';
import { logger } from './logging';
import { loadConfig } from './config';
import { initiateFetchingBeaconData } from './fetch-beacon-data';
import { initiateDataFeedUpdates } from './update-data-feeds';
import { initializeProviders } from './providers';
import { initializeWallets } from './wallets';
import { initializeState, updateState } from './state';

let stopSignalReceived = false;

export const handleStopSignal = (signal: string) => {
  logger.info(`Signal ${signal} received`);

  if (stopSignalReceived) {
    logger.warn('Second stop signal received, terminating immediately.');
    process.exit(1);
  }

  logger.info('Stopping Airseeker gracefully...');
  logger.info('Hit CTRL+C again to force terminate.');

  stopSignalReceived = true;
  // Let the process wait for the last cycles instead of killing it immediately
  updateState((state) => ({ ...state, stopSignalReceived: true }));
};

export async function main() {
  const config = loadConfig(path.join(__dirname, '..', 'config', 'airseeker.json'), process.env);
  initializeState(config);

  // We do it after initializeState because logger facilities aren't available before initializeState
  process.on('SIGINT', handleStopSignal);
  process.on('SIGTERM', handleStopSignal);

  initializeProviders();
  initializeWallets();
  initiateFetchingBeaconData();
  initiateDataFeedUpdates();
}
