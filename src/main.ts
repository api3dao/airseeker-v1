import * as path from 'path';
import { logger } from './logging';
import { loadConfig } from './config';
import { initiateFetchingBeaconData } from './fetch-beacon-data';
import { initiateBeaconUpdates } from './update-beacons';
import { initializeProviders } from './providers';
import { initializeState, updateState } from './state';

export const handleStopSignal = (signal: string) => {
  logger.info(`Signal ${signal} received`);
  logger.info('Stopping Airseeker...');
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

  initiateFetchingBeaconData();
  initiateBeaconUpdates();

  // This is required to make the process block because loop promises are not returned/not hierarchical.
  await new Promise((_resolve) => {});
}
