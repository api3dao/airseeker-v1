import { performance } from 'perf_hooks';
import { uniq } from 'lodash';
import { getState, updateState } from './state';
import { makeSignedDataGatewayRequest } from './make-request';
import { Config } from './validation';
import { sleep } from './utils';

export const initiateFetchingBeaconData = async (config: Config) => {
  console.log('Initiating fetching all beacon data');

  const beaconIdsToUpdate = uniq(
    Object.values(config.triggers.beaconUpdates).flatMap((beaconUpdatesPerSponsor) => {
      return Object.values(beaconUpdatesPerSponsor).flatMap((beaconUpdate) =>
        beaconUpdate.beacons.flatMap((b) => b.beaconId)
      );
    })
  );

  beaconIdsToUpdate.forEach((id) => {
    fetchBeaconDataInLoop(config, id);
  });
};

export const fetchBeaconDataInLoop = async (config: Config, beaconId: string) => {
  while (!getState().stopSignalReceived) {
    const startTimestamp = performance.now();
    const { fetchInterval } = config.beacons[beaconId];

    await fetchBeaconData(config, beaconId);

    const duration = performance.now() - startTimestamp;
    const waitTime = Math.max(0, fetchInterval * 1_000 - duration);
    await sleep(waitTime);
  }
};

export const fetchBeaconData = async (_config: Config, beaconId: string) => {
  console.log(`Fetching beacon data for: ${beaconId}`);

  const goRes = await makeSignedDataGatewayRequest();
  if (!goRes.success) {
    console.log(`Unable to call signed data gateway. Reason: "${goRes.error}"`);
  } else {
    updateState((state) => ({ ...state, beaconValues: { ...state.beaconValues, [beaconId]: goRes.data } }));
  }
};
