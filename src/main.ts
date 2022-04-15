import * as path from 'path';
import { loadConfig } from './config';
import { initiateFetchingBeaconData } from './fetch-beacon-data';
import { initializeProviders } from './providers';
import { initializeState, updateState } from './state';

const BEACON_UPDATE_FREQUENCY_MS = 10_000;

const config = loadConfig(path.join(__dirname, '..', 'config', 'airseeker.json'), process.env);
initializeState(config);

const handleStopSignal = (signal: string) => {
  console.log(`Signal ${signal} received`);
  console.log('Stopping Airseeeker...');
  // Let the process wait for the last cycles instead of killing it immediately
  updateState((state) => ({ ...state, stopSignalReceived: true }));
};

const updateBeacons = async () => {
  console.log('Updating beacons');
  if (!getState().stopSignalReceived) {
    setTimeout(() => {
      updateBeacons();
    }, BEACON_UPDATE_FREQUENCY_MS);
  }
};

initializeProviders();

initiateFetchingBeaconData();
updateBeacons();

process.on('SIGINT', handleStopSignal);
process.on('SIGTERM', handleStopSignal);
