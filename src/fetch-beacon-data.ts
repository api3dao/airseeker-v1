import { isEmpty, uniq } from 'lodash';
import { go, GoResultError } from '@api3/promise-utils';
import { logger } from './logging';
import { getState, updateState } from './state';
import { makeSignedDataGatewayRequests, makeApiRequest } from './make-request';
import { sleep } from './utils';
import { SignedData } from './validation';
import {
  GATEWAY_TIMEOUT_MS,
  INFINITE_RETRIES,
  NO_FETCH_EXIT_CODE,
  RANDOM_BACKOFF_MAX_MS,
  RANDOM_BACKOFF_MIN_MS,
} from './constants';

export const initiateFetchingBeaconData = async () => {
  logger.debug('Initiating fetching all beacon data');
  const { config } = getState();

  const beaconIdsToUpdate = uniq([
    ...Object.values(config.triggers.dataFeedUpdates).flatMap((dataFeedUpdatesPerSponsor) => {
      return Object.values(dataFeedUpdatesPerSponsor).flatMap((dataFeedUpdate) => {
        return [
          ...dataFeedUpdate.beacons.map((b) => b.beaconId),
          ...dataFeedUpdate.beaconSets.flatMap((b) => config.beaconSets[b.beaconSetId]),
        ];
      });
    }),
  ]);

  if (isEmpty(beaconIdsToUpdate)) {
    logger.error('No beacons to fetch data for found. Stopping.');
    process.exit(NO_FETCH_EXIT_CODE);
  }

  beaconIdsToUpdate.forEach(fetchBeaconDataInLoop);
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
export const fetchBeaconDataInLoop = async (beaconId: string) => {
  const { config } = getState();

  while (!getState().stopSignalReceived) {
    const startTimestamp = Date.now();
    const { fetchInterval } = config.beacons[beaconId];

    await fetchBeaconData(beaconId);

    const duration = Date.now() - startTimestamp;
    const waitTime = Math.max(0, fetchInterval * 1_000 - duration);
    await sleep(waitTime);
  }
};

export const fetchBeaconData = async (beaconId: string) => {
  const logOptionsBeaconId = { meta: { 'Beacon-ID': beaconId } };
  logger.debug('Fetching beacon data', logOptionsBeaconId);
  const { config } = getState();

  const { fetchInterval, airnode, templateId, fetchMethod } = config.beacons[beaconId];
  const template = config.templates[templateId];

  let fetchFn: () => Promise<SignedData>;
  let onAttemptError: (goRes: GoResultError<Error>) => void;
  switch (fetchMethod) {
    case 'api': {
      fetchFn = () => makeApiRequest({ ...template, id: templateId });
      onAttemptError = (goError: GoResultError<Error>) =>
        logger.warn(`Failed attempt to make direct API call. Error: ${goError.error}`, logOptionsBeaconId);
      break;
    }
    case 'gateway': {
      const gateway = config.gateways[airnode];
      fetchFn = () => makeSignedDataGatewayRequests(gateway, { ...template, id: templateId });
      onAttemptError = (goError: GoResultError<Error>) =>
        logger.warn(`Failed attempt to call signed data gateway. Error: ${goError.error}`, logOptionsBeaconId);
      break;
    }
    default:
      logger.warn(`Invalid API value fetch method ${fetchMethod}`, logOptionsBeaconId);
      return;
  }

  const goRes = await go(fetchFn, {
    attemptTimeoutMs: GATEWAY_TIMEOUT_MS,
    retries: INFINITE_RETRIES,
    delay: { type: 'random', minDelayMs: RANDOM_BACKOFF_MIN_MS, maxDelayMs: RANDOM_BACKOFF_MAX_MS },
    totalTimeoutMs: fetchInterval * 1_000,
    onAttemptError,
  });
  if (!goRes.success) {
    logger.warn(`Unable to fetch beacon data. Error: "${goRes.error}"`, logOptionsBeaconId);
    return;
  }

  const { data } = goRes;
  if (data) {
    updateState((state) => ({ ...state, beaconValues: { ...state.beaconValues, [beaconId]: data } }));
  }
};
