import { uniq } from 'lodash';
import { go } from '@api3/promise-utils';
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

/**
 * Calling "fetchBeaconData" in a loop every "fetchInterval" seconds until the stop signal has been received.
 *
 * Opted in for while loop approach (instead of recursive scheduling of setTimeout) to make sure "fetchBeaconData" calls
 * do not overlap. We measure the total running time of the "fetchBeaconData" and then wait the remaining time
 * accordingly.
 *
 * It is possible that the gateway is down and the the data fetching will take the full "fetchInterval" duration. In
 * that case we do not want to wait, but start calling the gateway immediately as part of the next fetch cycle.
 */
export const fetchBeaconDataInLoop = async (config: Config, beaconId: string) => {
  while (!getState().stopSignalReceived) {
    const startTimestamp = Date.now();
    const { fetchInterval } = config.beacons[beaconId];

    await fetchBeaconData(config, beaconId);

    const duration = Date.now() - startTimestamp;
    const waitTime = Math.max(0, fetchInterval * 1_000 - duration);
    await sleep(waitTime);
  }
};

export const fetchBeaconData = async (config: Config, beaconId: string) => {
  console.log(`Fetching beacon data for: ${beaconId}`);

  const { fetchInterval, airnode, templateId } = config.beacons[beaconId];
  const gateway = config.gateways[airnode];
  const template = config.templates[templateId];

  const infinityRetries = 100_000;
  const timeoutMs = 5_000;
  const goRes = await go(() => makeSignedDataGatewayRequest(gateway, template, timeoutMs), {
    attemptTimeoutMs: timeoutMs,
    retries: infinityRetries,
    delay: { type: 'random', minDelayMs: 0, maxDelayMs: 2_500 },
    totalTimeoutMs: fetchInterval * 1_000,
  });
  if (!goRes.success) {
    console.log(`Unable to call signed data gateway. Reason: "${goRes.error}"`);
    return;
  }

  const { data } = goRes;
  if (data) {
    updateState((state) => ({ ...state, beaconValues: { ...state.beaconValues, [beaconId]: data } }));
  }
};
