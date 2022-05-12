import * as path from 'path';
// We use the logging facilities directly initially because we can only use local logging facilities after state
// has been initialized.
import * as utilsLogger from '@api3/airnode-utilities/dist/logging';
import { logger } from './logging';
import { loadConfig } from './config';
import { initiateFetchingBeaconData } from './fetch-beacon-data';
import { initiateBeaconUpdates } from './update-beacons';
import { initializeProviders } from './providers';
import { initializeState, updateState } from './state';

export const handleStopSignal = (signal: string) => {
  logger.log(`Signal ${signal} received`);
  logger.log('Stopping Airseeker...');
  // Let the process wait for the last cycles instead of killing it immediately
  updateState((state) => ({ ...state, stopSignalReceived: true }));
};

/**
 * This is the entrypoint for Airseeker.
 */
export async function main(_event: any = {}) {
  utilsLogger.logger.log(`Airseeker Starting...`);

  // This is required for GCP Cloud Functions
  // PORT is set by GCP
  // This also conveniently limits Function instances to having one Airseeker running in them by virtue of the port
  // being in use when a second process starts in the same instance.
  if (process.env.PORT) {
    const startTime = Date.now();

    const http = require('http');
    http
      .createServer((req: any, res: any) => {
        utilsLogger.logger.log(`Received health check request`);
        utilsLogger.logger.log(`Uptime (minutes): ${(Date.now() - startTime) / 1_000 / 60}`);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write("This can be anything, so long as it isn't nothing :)");

        res.end();
      })
      .listen(parseInt(process.env.PORT));
    utilsLogger.logger.log(`HTTP Health Check Server Started on port ${process.env.PORT}`);
  }

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
