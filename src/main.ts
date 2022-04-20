import * as path from 'path';
import { loadConfig } from './config';
import { initiateFetchingBeaconData } from './fetch-beacon-data';
import { initiateBeaconUpdates } from './update-beacons';
import { initializeProviders } from './providers';
import { initializeState, updateState } from './state';

export async function main() {
  const config = loadConfig(path.join(__dirname, '..', 'config', 'airseeker.json'), process.env);
  initializeState(config);

  const handleStopSignal = (signal: string) => {
    console.log(`Signal ${signal} received`);
    console.log('Stopping Airseeeker...');
    // Let the process wait for the last cycles instead of killing it immediately
    updateState((state) => ({ ...state, stopSignalReceived: true }));
  };

  initializeProviders();

  initiateFetchingBeaconData();
  initiateBeaconUpdates();

  process.on('SIGINT', handleStopSignal);
  process.on('SIGTERM', handleStopSignal);
}
