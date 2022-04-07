import * as path from 'path';
import { performance } from 'perf_hooks';
import { uniq } from 'lodash';
import { GoResult } from '@api3/promise-utils';
import { loadConfig } from './config';
import { saveBeaconValue } from './beacon-value-storage';

const BEACON_UPDATE_FREQUENCY_MS = 10_000;
let stopSignalReceived = false;

// ============================
// Load configuration
// ============================
const config = loadConfig(path.join(__dirname, '..', 'config', 'config.json'), process.env);

const handleStopSignal = (signal: string) => {
  console.log(`Signal ${signal} received`);
  console.log('Stopping Airseeeker...');
  // Let the process wait for the last cycles instead of killing it immediately
  stopSignalReceived = true;
};

const initiateFetchingBeaconData = async () => {
  console.log('Initiating fetching all beacon data');

  const beaconIdsToUpdate = uniq(
    Object.values(config.triggers.beaconUpdates).flatMap((beaconUpdatesPerSponsor) => {
      return Object.values(beaconUpdatesPerSponsor).flatMap((beaconUpdate) =>
        beaconUpdate.beacons.flatMap((b) => b.beaconId)
      );
    })
  );

  beaconIdsToUpdate.forEach((id) => {
    fetchBeaconData(id);
  });
};

// TODO: https://api3dao.atlassian.net/browse/BEC-295
const makeSignedDataGatewayRequest = () => {
  return 123 as any as GoResult<any>;
};

const fetchBeaconData = async (beaconId: string) => {
  console.log(`Fetching beacon data for: ${beaconId}`);

  const startTimestamp = performance.now();
  const { fetchInterval } = config.beacons[beaconId];

  const goRes = await makeSignedDataGatewayRequest();
  if (!goRes.success) {
    console.log(`Unable to call signed data gateway. Reason: ${goRes.error}`);
  } else {
    saveBeaconValue(beaconId, goRes.data);
  }

  if (!stopSignalReceived) {
    const duration = performance.now() - startTimestamp;
    const waitTime = Math.max(0, fetchInterval - duration);
    setTimeout(() => {
      fetchBeaconData(beaconId);
    }, waitTime);
  }
};

const updateBeacons = async () => {
  console.log('Updating beacons');
  if (!stopSignalReceived) {
    setTimeout(() => {
      updateBeacons();
    }, BEACON_UPDATE_FREQUENCY_MS);
  }
};

initiateFetchingBeaconData();
updateBeacons();

process.on('SIGINT', handleStopSignal);
process.on('SIGTERM', handleStopSignal);
