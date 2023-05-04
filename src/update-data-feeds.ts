import { Api3ServerV1, Api3ServerV1__factory as Api3ServerV1Factory } from '@api3/airnode-protocol-v1';
import { go } from '@api3/promise-utils';
import { getGasPrice } from '@api3/airnode-utilities';
import { BigNumber, ethers, VoidSigner, Wallet } from 'ethers';
import { isEmpty, isNil } from 'lodash';
import { calculateMedian } from './calculations';
import { checkFulfillmentDataTimestamp, checkOnchainDataFreshness, checkUpdateCondition } from './check-condition';
import { INT224_MAX, INT224_MIN, NO_DATA_FEEDS_EXIT_CODE } from './constants';
import { logger } from './logging';
import { BeaconValueStorage, getState, Provider } from './state';
import { getTransactionCount } from './transaction-count';
import { prepareGoOptions, shortenAddress, sleep } from './utils';
import { BeaconSetUpdate, BeaconUpdate, Config, SignedData } from './validation';

type ProviderSponsorDataFeeds = {
  provider: Provider;
  sponsorAddress: string;
  updateInterval: number;
  beacons: BeaconUpdate[];
  beaconSets: BeaconSetUpdate[];
};

type BeaconSetBeaconValue = {
  beaconId: string;
  airnode: string;
  templateId: string;
  fetchInterval: number;
  timestamp: string;
  encodedValue: string;
  signature: string;
  value: ethers.BigNumber;
};

export enum DataFeedType {
  Beacon = 'Beacon',
  BeaconSet = 'BeaconSet',
}

// Based on https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/dapis/DapiServer.sol#L878
export const decodeBeaconValue = (encodedBeaconValue: string) => {
  const decodedBeaconValue = ethers.BigNumber.from(
    ethers.utils.defaultAbiCoder.decode(['int256'], encodedBeaconValue)[0]
  );
  if (decodedBeaconValue.gt(INT224_MAX) || decodedBeaconValue.lt(INT224_MIN)) {
    return null;
  }

  return decodedBeaconValue;
};

export const groupDataFeedsByProviderSponsor = () => {
  const { config, providers: stateProviders } = getState();
  return Object.entries(config.triggers.dataFeedUpdates).reduce(
    (acc: ProviderSponsorDataFeeds[], [chainId, dataFeedUpdatesPerSponsor]) => {
      const providers = stateProviders[chainId];

      const providerSponsorGroups = Object.entries(dataFeedUpdatesPerSponsor).reduce(
        (acc: ProviderSponsorDataFeeds[], [sponsorAddress, dataFeedUpdate]) => {
          return [...acc, ...providers.map((provider) => ({ provider, sponsorAddress, ...dataFeedUpdate }))];
        },
        []
      );

      return [...acc, ...providerSponsorGroups];
    },
    []
  );
};

export const initiateDataFeedUpdates = () => {
  logger.debug('Initiating data feed updates');

  const providerSponsorDataFeedsGroups = groupDataFeedsByProviderSponsor();
  if (isEmpty(providerSponsorDataFeedsGroups)) {
    logger.error('No data feed for processing found. Stopping.');
    process.exit(NO_DATA_FEEDS_EXIT_CODE);
  }
  return providerSponsorDataFeedsGroups.map(updateDataFeedsInLoop);
};

export const updateDataFeedsInLoop = async (providerSponsorDataFeeds: ProviderSponsorDataFeeds) => {
  let lastExecute = 0;
  let waitTime = 0;

  while (!getState().stopSignalReceived) {
    if (Date.now() - lastExecute > waitTime) {
      lastExecute = Date.now();
      const startTimestamp = Date.now();
      const { updateInterval } = providerSponsorDataFeeds;

      await updateBeacons(providerSponsorDataFeeds, startTimestamp);
      await updateBeaconSets(providerSponsorDataFeeds, startTimestamp);

      const duration = Date.now() - startTimestamp;
      waitTime = Math.max(0, updateInterval * 1_000 - duration);
    }
    await sleep(500);
  }
};

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const initializeUpdateCycle = async (
  providerSponsorDataFeeds: ProviderSponsorDataFeeds,
  dataFeedType: DataFeedType,
  startTime: number
) => {
  const { config, beaconValues, sponsorWalletsPrivateKey } = getState();
  const { provider, updateInterval, sponsorAddress, beacons, beaconSets } = providerSponsorDataFeeds;
  const { rpcProvider, chainId, providerName } = provider;
  const logOptions = {
    meta: {
      'Chain-ID': chainId,
      Provider: providerName,
      Sponsor: shortenAddress(sponsorAddress),
      DataFeedType: dataFeedType,
    },
  };

  logger.debug(`Initializing updates`, logOptions);

  // All the beacon updates for given provider & sponsor have up to <updateInterval> seconds to finish
  const totalTimeout = updateInterval * 1_000;

  // Prepare contract for beacon updates
  const contractAddress = config.chains[chainId].contracts['Api3ServerV1'];
  const contract = Api3ServerV1Factory.connect(contractAddress, rpcProvider);

  const sponsorWallet = new ethers.Wallet(sponsorWalletsPrivateKey[sponsorAddress]).connect(rpcProvider);

  // Get transaction count
  const transactionCount = await getTransactionCount(
    provider,
    sponsorWallet.address,
    prepareGoOptions(startTime, totalTimeout)
  );
  if (isNil(transactionCount)) {
    logger.warn(`Unable to fetch transaction count`, logOptions);
    return null;
  }

  const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, rpcProvider);

  return {
    contract,
    sponsorWallet,
    transactionCount,
    voidSigner,
    totalTimeout,
    logOptions,
    beaconValues,
    beacons,
    beaconSets,
    config,
    provider,
  };
};

type InitialUpdateData = {
  sponsorWallet: Wallet;
  beaconSets: BeaconSetUpdate[];
  voidSigner: VoidSigner;
  provider: Provider;
  contract: Api3ServerV1;
  beaconValues: BeaconValueStorage;
  totalTimeout: number;
  logOptions: { meta: { 'Chain-ID': string; DataFeedType: DataFeedType; Sponsor: string; Provider: string } };
  transactionCount: number;
  config: Config;
  beacons: BeaconUpdate[];
};

export const updateBeacon = async (
  beacon: { beaconId: string; deviationThreshold: number; heartbeatInterval: number },
  nonce: number,
  providerSponsorBeacons: ProviderSponsorDataFeeds,
  startTime: number,
  initialUpdateData: InitialUpdateData
) => {
  const { contract, sponsorWallet, voidSigner, totalTimeout, logOptions, beaconValues, config, provider } =
    initialUpdateData;
  const { chainId } = provider;

  const logOptionsBeaconId = {
    ...logOptions,
    meta: {
      ...logOptions.meta,
      'Sponsor-Wallet': shortenAddress(sponsorWallet.address),
      'Beacon-ID': beacon.beaconId,
    },
  };

  const beaconUpdateData = { ...beacon, ...config.beacons[beacon.beaconId] };

  logger.debug(`Updating beacon`, logOptionsBeaconId);
  // Check whether we have a value for given beacon
  const newBeaconResponse = beaconValues[beaconUpdateData.beaconId];
  if (!newBeaconResponse) {
    logger.warn(`No data available for beacon. Skipping.`, logOptionsBeaconId);
    return nonce;
  }

  const newBeaconValue = decodeBeaconValue(newBeaconResponse.encodedValue);
  if (!newBeaconValue) {
    logger.warn(`New beacon value is out of type range. Skipping.`, logOptionsBeaconId);
    return nonce;
  }

  const goDataFeed = await go(() => contract.connect(voidSigner).dataFeeds(beaconUpdateData.beaconId), {
    ...prepareGoOptions(startTime, totalTimeout),
    onAttemptError: (goError) =>
      logger.warn(`Failed attempt to read data feed. Error: ${goError.error}`, logOptionsBeaconId),
  });
  if (!goDataFeed.success) {
    logger.warn(`Unable to read data feed. Error: ${goDataFeed.error}`, logOptionsBeaconId);
    return nonce;
  }
  const onChainData = goDataFeed.data;
  if (!onChainData) {
    const message = `Missing on chain data for beacon. Skipping.`;
    logger.warn(message, logOptionsBeaconId);
    return nonce;
  }

  // Check that fulfillment data is newer than on chain data
  const isFulfillmentDataFresh = checkFulfillmentDataTimestamp(
    onChainData.timestamp,
    parseInt(newBeaconResponse.timestamp, 10)
  );
  if (!isFulfillmentDataFresh) {
    logger.warn(`Fulfillment data older than on-chain data. Skipping.`, logOptionsBeaconId);
    return nonce;
  }

  // Check that on chain data is newer than heartbeat interval
  const isOnchainDataFresh = checkOnchainDataFreshness(onChainData.timestamp, beaconUpdateData.heartbeatInterval);
  if (!isOnchainDataFresh) {
    logger.info(`On chain data timestamp older than heartbeat. Updating without condition check.`, logOptionsBeaconId);
  } else {
    // Check beacon condition
    const shouldUpdate = checkUpdateCondition(onChainData.value, beaconUpdateData.deviationThreshold, newBeaconValue);
    if (shouldUpdate === null) {
      logger.warn(`Unable to fetch current beacon value`, logOptionsBeaconId);
      // This can happen only if we reach the total timeout so it makes no sense to continue with the rest of the beacons
      return nonce;
    }
    if (!shouldUpdate) {
      logger.info(`Deviation threshold not reached. Skipping.`, logOptionsBeaconId);
      return nonce;
    }

    logger.info(`Deviation threshold reached. Updating.`, logOptionsBeaconId);
  }

  // Get transaction count only first time when update condition satisfied
  if (!nonce) {
    const transactionCount = await getTransactionCount(
      provider,
      sponsorWallet.address,
      prepareGoOptions(startTime, totalTimeout)
    );
    if (isNil(transactionCount)) {
      logger.warn(`Unable to fetch transaction count`, logOptionsBeaconId);
      return nonce;
    }
    nonce = transactionCount;
  }

  const getGasFn = () => getGasPrice(provider.rpcProvider.getProvider(), config.chains[chainId].options);

  // Get the latest gas price
  // We have to grab the limiter from the custom provider as the getGasPrice function contains its own timeouts.
  const [logs, gasTarget] = await provider.rpcProvider.getLimiter().schedule({ expiration: 30_000 }, getGasFn);
  logs.forEach((log) =>
    log.level === 'ERROR'
      ? logger.error(log.message, null, logOptionsBeaconId)
      : logger.info(log.message, logOptionsBeaconId)
  );

  // Update beacon
  const tx = await go(
    () =>
      contract
        .connect(sponsorWallet)
        .updateBeaconWithSignedData(
          beaconUpdateData.airnode,
          beaconUpdateData.templateId,
          newBeaconResponse.timestamp,
          newBeaconResponse.encodedValue,
          newBeaconResponse.signature,
          {
            nonce,
            ...gasTarget,
          }
        ),
    {
      ...prepareGoOptions(startTime, totalTimeout),
      onAttemptError: (goError) =>
        logger.warn(`Failed attempt to update beacon. Error ${goError.error}`, logOptionsBeaconId),
    }
  );

  if (!tx.success) {
    logger.warn(`Unable to update beacon with nonce ${nonce}. Error: ${tx.error}`, logOptionsBeaconId);
    return nonce;
  }

  logger.info(
    `Beacon successfully updated with value ${newBeaconValue} and nonce ${nonce}. Tx hash ${tx.data.hash}.`,
    logOptionsBeaconId
  );
  return nonce + 1;
};

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const updateBeacons = async (providerSponsorBeacons: ProviderSponsorDataFeeds, startTime: number) => {
  const initialUpdateData = await initializeUpdateCycle(providerSponsorBeacons, DataFeedType.Beacon, startTime);
  if (!initialUpdateData) return;
  const { transactionCount, beacons } = initialUpdateData;

  // Process beacon updates
  let nonce = transactionCount;

  for (const beacon of beacons) {
    try {
      nonce = await updateBeacon(beacon, nonce, providerSponsorBeacons, startTime, initialUpdateData);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }
};

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const updateBeaconSets = async (providerSponsorBeacons: ProviderSponsorDataFeeds, startTime: number) => {
  const initialUpdateData = await initializeUpdateCycle(providerSponsorBeacons, DataFeedType.BeaconSet, startTime);
  if (!initialUpdateData) return;
  const {
    contract,
    sponsorWallet,
    transactionCount,
    voidSigner,
    totalTimeout,
    logOptions,
    beaconValues,
    beaconSets,
    config,
    provider,
  } = initialUpdateData;
  const { chainId } = provider;
  // Process beacon set updates

  await beaconSets.reduce(async (accu, beaconSet) => {
    const nonce = await accu;

    const logOptionsBeaconSetId = {
      ...logOptions,
      meta: {
        ...logOptions.meta,
        'Sponsor-Wallet': shortenAddress(sponsorWallet.address),
        'BeaconSet-ID': beaconSet.beaconSetId,
      },
    };

    logger.debug(`Updating beacon set`, logOptionsBeaconSetId);

    // Fetch beacon set value & timestamp from the chain
    const goDataFeed = await go(() => contract.connect(voidSigner).dataFeeds(beaconSet.beaconSetId), {
      ...prepareGoOptions(startTime, totalTimeout),
      onAttemptError: (goError) =>
        logger.warn(`Failed attempt to read data feed. Error: ${goError.error}`, logOptionsBeaconSetId),
    });
    if (!goDataFeed.success) {
      logger.warn(`Unable to read data feed. Error: ${goDataFeed.error}`, logOptionsBeaconSetId);
      return nonce;
    }
    const beaconSetOnChainData = goDataFeed.data;
    if (!beaconSetOnChainData) {
      const message = `Missing on chain data for beaconSet. Skipping.`;
      logger.warn(message, logOptionsBeaconSetId);
      return nonce;
    }

    // Retrieve values for each beacon within the set from the cache (common memory)
    const beaconSetBeaconValuesPromises: Promise<BeaconSetBeaconValue>[] = config.beaconSets[beaconSet.beaconSetId].map(
      async (beaconId) => {
        const logOptionsBeaconId = {
          ...logOptionsBeaconSetId,
          meta: {
            ...logOptionsBeaconSetId.meta,
            'Beacon-ID': beaconId,
          },
        };

        const beaconResponse: SignedData = beaconValues[beaconId];

        // Check whether we have a value for given beacon
        if (!beaconResponse) {
          logger.warn('Missing off chain data for beacon.', logOptionsBeaconId);
          // If there's no value for a given beacon, fetch it from the chain
          const goDataFeed = await go(() => contract.connect(voidSigner).dataFeeds(beaconId), {
            ...prepareGoOptions(startTime, totalTimeout),
            onAttemptError: (goError) =>
              logger.warn(`Failed attempt to read data feed. Error: ${goError.error}`, logOptionsBeaconSetId),
          });
          if (!goDataFeed.success) {
            logger.warn(`Unable to read data feed. Error: ${goDataFeed.error}`, logOptionsBeaconSetId);
            throw new Error(goDataFeed.error.message);
          }
          const beaconValueOnChain = goDataFeed.data;
          // If the value is not available on the chain skip the update
          if (!beaconValueOnChain) {
            const message = `Missing on chain data for beacon.`;
            logger.warn(message, logOptionsBeaconId);
            throw new Error(message);
          }

          return {
            beaconId,
            timestamp: beaconValueOnChain.timestamp.toString(),
            encodedValue: '0x',
            signature: '0x',
            value: beaconValueOnChain.value,
            ...config.beacons[beaconId],
          };
        }

        const decodedValue = decodeBeaconValue(beaconResponse.encodedValue);
        if (!decodedValue) {
          const message = `New beacon value is out of type range.`;
          logger.warn(message, logOptionsBeaconId);
          throw new Error(message);
        }

        return { beaconId, ...beaconResponse, value: decodedValue, ...config.beacons[beaconId] };
      }
    );
    const beaconSetBeaconValuesResults = await Promise.allSettled(beaconSetBeaconValuesPromises);
    if (beaconSetBeaconValuesResults.some((data) => data.status === 'rejected')) {
      logger.warn('There was an error fetching beacon data for beacon set. Skipping.', logOptionsBeaconSetId);
      return nonce;
    }

    const beaconSetBeaconValues = beaconSetBeaconValuesResults.map(
      (result) => (result as PromiseFulfilledResult<BeaconSetBeaconValue>).value
    );

    const newBeaconSetValue = calculateMedian(beaconSetBeaconValues.map((value) => value.value));
    // re-implementation of https://github.com/api3dao/airnode-protocol-v1/blob/ac6ede80ef2d8978b3ad08168d452909a538d10b/contracts/api3-server-v1/DataFeedServer.sol#L148
    const newBeaconSetTimestamp = calculateMedian(
      beaconSetBeaconValues.map((value) => BigNumber.from(value.timestamp))
    ).toNumber();

    // Check that fulfillment data is newer than on chain data
    const isFulfillmentDataFresh = checkFulfillmentDataTimestamp(beaconSetOnChainData.timestamp, newBeaconSetTimestamp);
    if (!isFulfillmentDataFresh) {
      logger.warn(`Fulfillment data older than on-chain beacon set data. Skipping.`, logOptionsBeaconSetId);
      return nonce;
    }

    // https://github.com/api3dao/airnode-protocol-v1/blob/ac6ede80ef2d8978b3ad08168d452909a538d10b/contracts/api3-server-v1/DataFeedServer.sol#L54
    if (newBeaconSetTimestamp === beaconSetOnChainData.timestamp) {
      if (newBeaconSetValue === beaconSetOnChainData.value) {
        logger.warn('Update attempt would not actually update beaconset', logOptionsBeaconSetId);
        return nonce;
      }
    }
    logger.info(
      `Got past update check ${JSON.stringify({
        beaconSetOnChainData,
        newBeaconSetTimestamp,
        newBeaconSetValue,
      })}`,
      logOptionsBeaconSetId
    );

    // Check that on chain data is newer than heartbeat interval
    const isOnchainDataFresh = checkOnchainDataFreshness(beaconSetOnChainData.timestamp, beaconSet.heartbeatInterval);
    if (!isOnchainDataFresh) {
      logger.info(
        `On chain data timestamp older than heartbeat. Updating without condition check.`,
        logOptionsBeaconSetId
      );
    } else {
      // Check beacon set condition
      // If the deviation threshold is reached do the update, skip otherwise
      const shouldUpdate = checkUpdateCondition(
        beaconSetOnChainData.value,
        beaconSet.deviationThreshold,
        newBeaconSetValue
      );
      if (shouldUpdate === null) {
        logger.warn(`Unable to fetch current beacon set value`, logOptionsBeaconSetId);
        // This can happen only if we reach the total timeout so it makes no sense to continue with the rest of the beaconSets
        return nonce;
      }
      if (!shouldUpdate) {
        logger.info(`Deviation threshold not reached. Skipping.`, logOptionsBeaconSetId);
        return nonce;
      }

      logger.info(`Deviation threshold reached. Updating.`, logOptionsBeaconSetId);
    }

    logger.info(`Got past beaconset update checks - updating children first...`, logOptionsBeaconSetId);
    // Get the latest gas price
    const [logs, gasTarget] = await getGasPrice(provider.rpcProvider, config.chains[chainId].options);
    logs.forEach((log) => (log.level === 'ERROR' ? logger.error(log.message) : logger.info(log.message)));

    // Update beacon set constituents first
    const nonceAfterChildUpdates = await beaconSetBeaconValues.reduce(async (promisedNonce, { beaconId }) => {
      logger.info(`Calling updateBeacon for ${beaconId}`, logOptionsBeaconSetId);
      // not entirely sure how to handle the deviation threshold:
      // if we're at this point we know for sure that the beaconset should be updated, so ideally we actually need to
      // calculate if updating the underlying beacon will have a material effect on the parent, but this is 😬
      return updateBeacon(
        { beaconId, heartbeatInterval: beaconSet.heartbeatInterval, deviationThreshold: beaconSet.deviationThreshold },
        await promisedNonce,
        providerSponsorBeacons,
        startTime,
        initialUpdateData
      );
    }, Promise.resolve(nonce));

    logger.info(
      `Updated ${nonce - transactionCount} constituent beacons of ${beaconSetBeaconValues.length}`,
      logOptionsBeaconSetId
    );

    logger.info(`Attempting update of beacon set`, logOptionsBeaconSetId);

    // Update beacon set
    const tx = await go(
      () =>
        contract.connect(sponsorWallet).updateBeaconSetWithBeacons(
          beaconSetBeaconValues.map(({ beaconId }) => beaconId),
          {
            nonce: nonceAfterChildUpdates,
            ...gasTarget,
          }
        ),
      {
        ...prepareGoOptions(startTime, totalTimeout),
        onAttemptError: (goError) =>
          logger.warn(`Failed attempt to update beacon set. Error ${goError.error}`, logOptionsBeaconSetId),
      }
    );

    if (!tx.success) {
      logger.warn(`Unable to update beacon set with nonce ${nonce}. Error: ${tx.error}`, logOptionsBeaconSetId);
      return nonce;
    }

    logger.info(`Beacon set successfully updated with nonce ${nonce}. Tx hash ${tx.data.hash}.`, logOptionsBeaconSetId);
    return nonceAfterChildUpdates + 1;
  }, Promise.resolve(transactionCount));
};
