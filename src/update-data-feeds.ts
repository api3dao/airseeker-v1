import { DapiServer__factory as DapiServerFactory } from '@api3/airnode-protocol-v1';
import { getGasPrice } from '@api3/airnode-utilities';
import { go } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { chunk, isEmpty, isNil } from 'lodash';
import { calculateMedian } from './calculations';
import {
  checkBeaconSetSignedDataFreshness,
  checkBeaconSignedDataFreshness,
  checkOnchainDataFreshness,
  checkUpdateCondition,
} from './check-condition';
import {
  DATAFEED_READ_BATCH_SIZE,
  DATAFEED_UPDATE_BATCH_SIZE,
  INT224_MAX,
  INT224_MIN,
  NO_DATA_FEEDS_EXIT_CODE,
} from './constants';
import { logger, LogOptionsOverride } from './logging';
import { getState, Provider } from './state';
import { getTransactionCount } from './transaction-count';
import { prepareGoOptions, shortenAddress, sleep } from './utils';
import { Beacon, BeaconSetUpdate, BeaconUpdate, SignedData } from './validation';

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
  providerSponsorDataFeedsGroups.forEach(updateDataFeedsInLoop);
};

export const updateDataFeedsInLoop = async (providerSponsorDataFeeds: ProviderSponsorDataFeeds) => {
  while (!getState().stopSignalReceived) {
    const startTimestamp = Date.now();
    const { updateInterval } = providerSponsorDataFeeds;

    await updateBeacons(providerSponsorDataFeeds, startTimestamp);
    await updateBeaconSets(providerSponsorDataFeeds, startTimestamp);

    const duration = Date.now() - startTimestamp;
    const waitTime = Math.max(0, updateInterval * 1_000 - duration);
    await sleep(waitTime);
  }
};

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const initializeUpdateCycle = (
  providerSponsorDataFeeds: ProviderSponsorDataFeeds,
  dataFeedType: DataFeedType
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
  const contractAddress = config.chains[chainId].contracts['DapiServer'];
  const contract = DapiServerFactory.connect(contractAddress, rpcProvider);

  const sponsorWallet = new ethers.Wallet(sponsorWalletsPrivateKey[sponsorAddress]).connect(rpcProvider);

  const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, rpcProvider);

  return {
    contract,
    sponsorWallet,
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

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const updateBeacons = async (providerSponsorBeacons: ProviderSponsorDataFeeds, startTime: number) => {
  const initialUpdateData = initializeUpdateCycle(providerSponsorBeacons, DataFeedType.Beacon);
  if (!initialUpdateData) return;
  const { contract, sponsorWallet, voidSigner, totalTimeout, logOptions, beaconValues, beacons, config, provider } =
    initialUpdateData;
  const { chainId } = provider;

  type BeaconUpdateData = {
    logOptionsBeaconId: LogOptionsOverride;
    beaconUpdate: BeaconUpdate;
    beacon: Beacon;
    newBeaconResponse: SignedData;
    newBeaconValue: ethers.BigNumber;
    dataFeedsCalldata: string;
  };

  // Process beacon read calldatas
  let beaconUpdates: BeaconUpdateData[] = [];

  // Iterate over beacons listed under triggers section in config
  for (const beacon of beacons) {
    const logOptionsBeaconId = {
      ...logOptions,
      meta: {
        ...logOptions.meta,
        'Sponsor-Wallet': shortenAddress(sponsorWallet.address),
        'Beacon-ID': beacon.beaconId,
      },
    };

    logger.debug(`Processing beacon update`, logOptionsBeaconId);

    // Check whether we have a value from the provider API for given beacon
    const newBeaconResponse = beaconValues[beacon.beaconId];
    if (!newBeaconResponse) {
      logger.warn(`No data available for beacon. Skipping.`, logOptionsBeaconId);
      continue;
    }

    const newBeaconValue = decodeBeaconValue(newBeaconResponse.encodedValue);
    if (!newBeaconValue) {
      logger.warn(`New beacon value is out of type range. Skipping.`, logOptionsBeaconId);
      continue;
    }

    beaconUpdates = [
      ...beaconUpdates,
      {
        logOptionsBeaconId,
        beaconUpdate: beacon,
        beacon: config.beacons[beacon.beaconId],
        newBeaconResponse,
        newBeaconValue,
        dataFeedsCalldata: contract.interface.encodeFunctionData('dataFeeds', [beacon.beaconId]),
      },
    ];
  }

  let nonce: number | undefined;

  for (const readBatch of chunk(beaconUpdates, DATAFEED_READ_BATCH_SIZE)) {
    // Read beacon batch onchain values
    const goDatafeedsTryMulticall = await go(
      () => {
        const calldatas = readBatch.map((beaconUpdateData) => beaconUpdateData.dataFeedsCalldata);
        return contract.connect(voidSigner).callStatic.tryMulticall(calldatas);
      },
      {
        ...prepareGoOptions(startTime, totalTimeout),
        onAttemptError: (goError) =>
          logger.warn(`Failed attempt to read beacon data using multicall. Error ${goError.error}`, logOptions),
      }
    );
    if (!goDatafeedsTryMulticall.success) {
      logger.warn(`Unable to read beacon data using multicall. Error: ${goDatafeedsTryMulticall.error}`, logOptions);
      continue;
    }

    const { successes, returndata } = goDatafeedsTryMulticall.data;

    // Process beacon update calldatas
    let updateDataFeedWithSignedDataCalldatas: string[] = [];

    for (let i = 0; i < readBatch.length; i++) {
      const beaconReturndata = returndata[i];
      const beaconUpdateData = readBatch[i];

      if (!successes[i]) {
        logger.warn(`Unable to read data feed. Error: ${beaconReturndata}`, beaconUpdateData.logOptionsBeaconId);
        continue;
      }

      // Decode on-chain data returned by tryMulticall
      const [onChainDataValue, onChainDataTimestamp] = ethers.utils.defaultAbiCoder.decode(
        ['int224', 'uint32'],
        beaconReturndata
      );

      // Check that signed data is newer than on chain value
      const isSignedDataFresh = checkBeaconSignedDataFreshness(
        onChainDataTimestamp,
        beaconUpdateData.newBeaconResponse.timestamp
      );
      if (!isSignedDataFresh) {
        logger.warn(`Signed data older than on chain record. Skipping.`, beaconUpdateData.logOptionsBeaconId);
        continue;
      }

      // Check that on chain data is newer than heartbeat interval
      const isOnchainDataFresh = checkOnchainDataFreshness(
        onChainDataTimestamp,
        beaconUpdateData.beaconUpdate.heartbeatInterval
      );
      if (!isOnchainDataFresh) {
        logger.info(
          `On chain data timestamp older than heartbeat. Updating without condition check.`,
          beaconUpdateData.logOptionsBeaconId
        );
      } else {
        // Check beacon condition
        const shouldUpdate = checkUpdateCondition(
          onChainDataValue,
          beaconUpdateData.beaconUpdate.deviationThreshold,
          beaconUpdateData.newBeaconValue
        );
        if (shouldUpdate === null) {
          logger.warn(`Unable to fetch current beacon value`, beaconUpdateData.logOptionsBeaconId);
          // This can happen only if we reach the total timeout so it makes no sense to continue with the rest of the beacons
          return;
        }
        if (!shouldUpdate) {
          logger.info(`Deviation threshold not reached. Skipping.`, beaconUpdateData.logOptionsBeaconId);
          continue;
        }
        logger.info(`Deviation threshold reached. Updating.`, beaconUpdateData.logOptionsBeaconId);
      }

      updateDataFeedWithSignedDataCalldatas = [
        ...updateDataFeedWithSignedDataCalldatas,
        contract.interface.encodeFunctionData('updateDataFeedWithSignedData', [
          [
            ethers.utils.defaultAbiCoder.encode(
              ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
              [
                beaconUpdateData.beacon.airnode,
                beaconUpdateData.beacon.templateId,
                beaconUpdateData.newBeaconResponse.timestamp,
                beaconUpdateData.newBeaconResponse.encodedValue,
                beaconUpdateData.newBeaconResponse.signature,
              ]
            ),
          ],
        ]),
      ];
    }

    // Get transaction count only first time when update condition satisfied
    if (!nonce) {
      const transactionCount = await getTransactionCount(
        provider,
        sponsorWallet.address,
        prepareGoOptions(startTime, totalTimeout)
      );
      if (isNil(transactionCount)) {
        logger.warn(`Unable to fetch transaction count for sponsor wallet ${sponsorWallet.address}`, logOptions);
        return;
      }
      nonce = transactionCount;
    }

    for (const updateBatch of chunk(updateDataFeedWithSignedDataCalldatas, DATAFEED_UPDATE_BATCH_SIZE)) {
      // Get the latest gas price
      const [logs, gasTarget] = await getGasPrice(provider.rpcProvider, config.chains[chainId].options);
      logs.forEach((log) =>
        log.level === 'ERROR' ? logger.error(log.message, null, logOptions) : logger.info(log.message, logOptions)
      );

      // Update beacon batch onchain values
      const tx = await go(() => contract.connect(sponsorWallet).tryMulticall(updateBatch, { nonce, ...gasTarget }), {
        ...prepareGoOptions(startTime, totalTimeout),
        onAttemptError: (goError) =>
          logger.warn(`Failed attempt to update beacon batch. Error ${goError.error}`, logOptions),
      });
      if (!tx.success) {
        logger.warn(`Unable send beacon batch update transaction with nonce ${nonce}. Error: ${tx.error}`, logOptions);
        return;
      }
      logger.info(
        `Beacon batch update transaction was successfully sent with nonce ${nonce}. Tx hash ${tx.data.hash}.`,
        logOptions
      );
      nonce++;
    }
  }
};

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const updateBeaconSets = async (providerSponsorBeacons: ProviderSponsorDataFeeds, startTime: number) => {
  const initialUpdateData = initializeUpdateCycle(providerSponsorBeacons, DataFeedType.BeaconSet);
  if (!initialUpdateData) return;
  const { contract, sponsorWallet, voidSigner, totalTimeout, logOptions, beaconValues, beaconSets, config, provider } =
    initialUpdateData;
  const { chainId } = provider;

  type BeaconSetUpdateData = {
    logOptionsBeaconSetId: LogOptionsOverride;
    beaconSetUpdate: BeaconSetUpdate;
    dataFeedsCalldata: string;
  };

  // Process beacon set read calldatas
  let beaconSetUpdates: BeaconSetUpdateData[] = [];

  for (const beaconSet of beaconSets) {
    const logOptionsBeaconSetId = {
      ...logOptions,
      meta: {
        ...logOptions.meta,
        'Sponsor-Wallet': shortenAddress(sponsorWallet.address),
        'BeaconSet-ID': beaconSet.beaconSetId,
      },
    };

    logger.debug(`Processing beacon set update`, logOptionsBeaconSetId);

    beaconSetUpdates = [
      ...beaconSetUpdates,
      {
        logOptionsBeaconSetId,
        beaconSetUpdate: beaconSet,
        dataFeedsCalldata: contract.interface.encodeFunctionData('dataFeeds', [beaconSet.beaconSetId]),
      },
    ];
  }

  let nonce: number | undefined;

  for (const readBatch of chunk(beaconSetUpdates, DATAFEED_READ_BATCH_SIZE)) {
    // Read beacon set batch onchain values
    const goDatafeedsTryMulticall = await go(
      () => {
        const calldatas = readBatch.map((beaconSetUpdateData) => beaconSetUpdateData.dataFeedsCalldata);
        return contract.connect(voidSigner).callStatic.tryMulticall(calldatas);
      },
      {
        ...prepareGoOptions(startTime, totalTimeout),
        onAttemptError: (goError) =>
          logger.warn(`Failed attempt to read beaconSet data using multicall. Error ${goError.error}`, logOptions),
      }
    );
    if (!goDatafeedsTryMulticall.success) {
      logger.warn(`Unable to read beaconSet data using multicall. Error: ${goDatafeedsTryMulticall.error}`, logOptions);
      continue;
    }

    const { successes, returndata } = goDatafeedsTryMulticall.data;

    for (let i = 0; i < readBatch.length; i++) {
      const beaconSetReturndata = returndata[i];
      const beaconSetUpdateData = readBatch[i];

      if (!successes[i]) {
        logger.warn(
          `Unable to read data feed. Error: ${beaconSetReturndata}`,
          beaconSetUpdateData.logOptionsBeaconSetId
        );
        continue;
      }

      // Decode on-chain data returned by tryMulticall
      const [onChainDataValue, onChainDataTimestamp] = ethers.utils.defaultAbiCoder.decode(
        ['int224', 'uint32'],
        beaconSetReturndata
      );

      // Retrieve values for each beacon within the set from the cache (common memory)
      const beaconSetBeaconValuesPromises: Promise<BeaconSetBeaconValue>[] = config.beaconSets[
        beaconSetUpdateData.beaconSetUpdate.beaconSetId
      ].map(async (beaconId) => {
        const logOptionsBeaconId = {
          ...beaconSetUpdateData.logOptionsBeaconSetId,
          meta: {
            ...beaconSetUpdateData.logOptionsBeaconSetId.meta,
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
              logger.warn(
                `Failed attempt to read data feed. Error: ${goError.error}`,
                beaconSetUpdateData.logOptionsBeaconSetId
              ),
          });
          if (!goDataFeed.success) {
            logger.warn(
              `Unable to read data feed. Error: ${goDataFeed.error}`,
              beaconSetUpdateData.logOptionsBeaconSetId
            );
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
      });
      const beaconSetBeaconValuesResults = await Promise.allSettled(beaconSetBeaconValuesPromises);
      if (beaconSetBeaconValuesResults.some((data) => data.status === 'rejected')) {
        logger.warn(
          'There was an error fetching beacon data for beacon set. Skipping.',
          beaconSetUpdateData.logOptionsBeaconSetId
        );
        continue;
      }

      const beaconSetBeaconValues = beaconSetBeaconValuesResults.map(
        (result) => (result as PromiseFulfilledResult<BeaconSetBeaconValue>).value
      );

      const isSignedDataFresh = checkBeaconSetSignedDataFreshness(
        onChainDataTimestamp,
        beaconSetBeaconValues.map((value) => value.timestamp)
      );
      if (!isSignedDataFresh) {
        logger.info('On chain beacon set value is more up-to-date. Skipping.');
        continue;
      }

      // Check that on chain data is newer than heartbeat interval
      const isOnchainDataFresh = checkOnchainDataFreshness(
        onChainDataTimestamp,
        beaconSetUpdateData.beaconSetUpdate.heartbeatInterval
      );
      if (!isOnchainDataFresh) {
        logger.info(
          `On chain data timestamp older than heartbeat. Updating without condition check.`,
          beaconSetUpdateData.logOptionsBeaconSetId
        );
      } else {
        // Check beacon set condition
        // If the deviation threshold is reached do the update, skip otherwise
        const updatedValue = calculateMedian(beaconSetBeaconValues.map((value) => value.value));
        const shouldUpdate = checkUpdateCondition(
          onChainDataValue,
          beaconSetUpdateData.beaconSetUpdate.deviationThreshold,
          updatedValue
        );
        if (shouldUpdate === null) {
          logger.warn(`Unable to fetch current beacon set value`, beaconSetUpdateData.logOptionsBeaconSetId);
          // This can happen only if we reach the total timeout so it makes no sense to continue with the rest of the beaconSets
          return;
        }
        if (!shouldUpdate) {
          logger.info(`Deviation threshold not reached. Skipping.`, beaconSetUpdateData.logOptionsBeaconSetId);
          continue;
        }

        logger.info(`Deviation threshold reached. Updating.`, beaconSetUpdateData.logOptionsBeaconSetId);
      }

      // Get transaction count only first time when update condition satisfied
      if (!nonce) {
        const transactionCount = await getTransactionCount(
          provider,
          sponsorWallet.address,
          prepareGoOptions(startTime, totalTimeout)
        );
        if (isNil(transactionCount)) {
          logger.warn(`Unable to fetch transaction count`, beaconSetUpdateData.logOptionsBeaconSetId);
          return;
        }
        nonce = transactionCount;
      }

      // Get the latest gas price
      const [logs, gasTarget] = await getGasPrice(provider.rpcProvider, config.chains[chainId].options);
      logs.forEach((log) => (log.level === 'ERROR' ? logger.error(log.message) : logger.info(log.message)));

      // Update beacon set
      const tx = await go(
        () =>
          contract.connect(sponsorWallet).updateDataFeedWithSignedData(
            beaconSetBeaconValues.map(({ airnode, templateId, timestamp, encodedValue, signature }) =>
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
                [airnode, templateId, timestamp, encodedValue, signature]
              )
            ),
            {
              nonce,
              ...gasTarget,
            }
          ),
        {
          ...prepareGoOptions(startTime, totalTimeout),
          onAttemptError: (goError) =>
            logger.warn(
              `Failed attempt to update beacon set. Error ${goError.error}`,
              beaconSetUpdateData.logOptionsBeaconSetId
            ),
        }
      );

      if (!tx.success) {
        logger.warn(
          `Unable to update beacon set with nonce ${nonce}. Error: ${tx.error}`,
          beaconSetUpdateData.logOptionsBeaconSetId
        );
        return;
      }

      logger.info(
        `Beacon set successfully updated with nonce ${nonce}. Tx hash ${tx.data.hash}.`,
        beaconSetUpdateData.logOptionsBeaconSetId
      );
      nonce++;
    }
  }
};
