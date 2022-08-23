import { initiateFetchingBeaconData } from './fetch-beacon-data';
import { initiateDataFeedUpdates } from './update-data-feeds';
import { initializeProviders } from './providers';
import { initializeState } from './state';
import { Config } from './validation';

export async function main(config: Config) {
  initializeState(config);

  initializeProviders();

  initiateFetchingBeaconData();
  initiateDataFeedUpdates();
}
