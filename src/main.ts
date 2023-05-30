import * as path from 'path';
import { sendOpsGenieHeartbeat } from '@api3/operations-utilities/dist';
import { logger } from './logging';
import { loadConfig } from './config';
import { initiateFetchingBeaconData } from './fetch-beacon-data';
import { initiateDataFeedUpdates } from './update-data-feeds';
import { initializeProviders } from './providers';
import { filterEmptySponsors, initializeWallets } from './wallets';
import { expireLimiterJobs, initializeState, updateState } from './state';
import { Config } from './validation';

export const handleStopSignal = (signal: string) => {
  logger.info(`Signal ${signal} received`);
  logger.info('Stopping Airseeker gracefully...');

  expireLimiterJobs();
  updateState((state) => ({ ...state, stopSignalReceived: true }));
};

const heartbeatReporter = async (config: Config) => {
  // wait for close to the 15 minute timeout
  await new Promise((r) => setTimeout(r, 14 * 60 * 1_000));

  const opsGenieApiKey = config?.monitoring?.opsGenieApiKey;
  const heartbeatId = config?.monitoring?.heartbeatId;

  // tell OpsGenie we ran
  if (opsGenieApiKey && heartbeatId) {
    await sendOpsGenieHeartbeat(heartbeatId, { apiKey: opsGenieApiKey, responders: [] });
  }
};

export async function main() {
  const config = loadConfig(path.join(__dirname, '..', 'config', 'airseeker.json'), process.env);
  initializeState(config);

  // TODO Remove
  // We do it after initializeState because logger facilities aren't available before initializeState
  process.on('SIGINT', handleStopSignal); // CTRL+C
  process.on('SIGTERM', handleStopSignal);

  process.on('exit', () => {
    logger.info('Airseeker has quit.');
  });

  initializeProviders();
  initializeWallets();
  await filterEmptySponsors();

  await Promise.all([initiateFetchingBeaconData(), initiateDataFeedUpdates(), heartbeatReporter(config)]);
}
