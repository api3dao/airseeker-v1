import { Api3ServerV1__factory as Api3ServerV1Factory } from '@api3/airnode-protocol-v1';
import { getGasPrice } from '@api3/airnode-utilities';
import { go } from '@api3/promise-utils';
import { BigNumber, ethers } from 'ethers';
import { chunk, isEmpty, isNil } from 'lodash';
import { calculateMedian } from './calculations';
import { checkConditions } from './check-condition';
import {
  DATAFEED_READ_BATCH_SIZE,
  DATAFEED_UPDATE_BATCH_SIZE,
  INT224_MAX,
  INT224_MIN,
  NO_DATA_FEEDS_EXIT_CODE,
} from './constants';
import { LogOptionsOverride, logger } from './logging';
import { Provider, getState } from './state';
import { getTransactionCount } from './transaction-count';
import { prepareGoOptions, shortenAddress, sleep } from './utils';
import { Beacon, BeaconSetTrigger, BeaconTrigger, SignedData } from './validation';
import { checkAndReport } from './alerting';

type ProviderSponsorDataFeeds = {
  provider: Provider;
  sponsorAddress: string;
  updateInterval: number;
  beaconTriggers: BeaconTrigger[];
  beaconSetTriggers: BeaconSetTrigger[];
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
        (acc: ProviderSponsorDataFeeds[], [sponsorAddress, { updateInterval, beacons, beaconSets }]) => {
          return [
            ...acc,
            ...providers.map((provider) => ({
              provider,
              sponsorAddress,
              updateInterval,
              beaconTriggers: beacons,
              beaconSetTriggers: beaconSets,
            })),
          ];
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
  const { provider, updateInterval, sponsorAddress, beaconTriggers, beaconSetTriggers } = providerSponsorDataFeeds;
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

  if (
    (dataFeedType === DataFeedType.Beacon && isEmpty(beaconTriggers)) ||
    (dataFeedType === DataFeedType.BeaconSet && isEmpty(beaconSetTriggers))
  ) {
    logger.debug(`No ${dataFeedType} found, skipping initialization cycle`, logOptions);
    return null;
  }

  const { config, beaconValues, sponsorWalletsPrivateKey } = getState();
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
    beaconTriggers,
    beaconSetTriggers,
    config,
    provider,
  };
};

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const updateBeacons = async (providerSponsorDataFeeds: ProviderSponsorDataFeeds, startTime: number) => {
  const initialUpdateData = await initializeUpdateCycle(providerSponsorDataFeeds, DataFeedType.Beacon, startTime);
  if (!initialUpdateData) return;
  const {
    contract,
    sponsorWallet,
    transactionCount,
    voidSigner,
    totalTimeout,
    logOptions,
    beaconValues,
    beaconTriggers,
    config,
    provider,
  } = initialUpdateData;
  const { chainId } = provider;

  const monitorOnly = config?.monitoring?.monitorOnly;

  type BeaconUpdate = {
    logOptionsBeaconId: LogOptionsOverride;
    beaconTrigger: BeaconTrigger;
    beacon: Beacon;
    newBeaconResponse: SignedData;
    newBeaconValue: ethers.BigNumber;
    dataFeedsCalldata: string;
  };

  // Process beacon read calldatas
  const beaconUpdates = beaconTriggers.reduce((acc: BeaconUpdate[], beaconTrigger) => {
    const logOptionsBeaconId = {
      ...logOptions,
      meta: {
        ...logOptions.meta,
        'Sponsor-Wallet': shortenAddress(sponsorWallet.address),
        'Beacon-ID': beaconTrigger.beaconId,
      },
    };

    logger.debug(`Processing beacon update`, logOptionsBeaconId);

    // Check whether we have a value from the provider API for given beacon
    const newBeaconResponse = beaconValues[beaconTrigger.beaconId];
    if (!newBeaconResponse) {
      logger.warn(`No data available for beacon. Skipping.`, logOptionsBeaconId);
      return acc;
    }

    const newBeaconValue = decodeBeaconValue(newBeaconResponse.encodedValue);
    if (!newBeaconValue) {
      logger.warn(`New beacon value is out of type range. Skipping.`, logOptionsBeaconId);
      return acc;
    }

    return [
      ...acc,
      {
        logOptionsBeaconId,
        beaconTrigger,
        beacon: config.beacons[beaconTrigger.beaconId],
        newBeaconResponse,
        newBeaconValue,
        dataFeedsCalldata: contract.interface.encodeFunctionData('dataFeeds', [beaconTrigger.beaconId]),
      },
    ];
  }, []);

  for (const readBatch of chunk(beaconUpdates, DATAFEED_READ_BATCH_SIZE)) {
    // Read beacon batch onchain values
    const goDatafeedsTryMulticall = await go(
      () => {
        const calldatas = readBatch.map((beaconUpdate) => beaconUpdate.dataFeedsCalldata);
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
    let beaconUpdateCalldatas: string[] = [];

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

      if (monitorOnly) {
        await Promise.allSettled([
          checkAndReport(
            'Beacon',
            beaconUpdateData.beaconTrigger.beaconId,
            onChainDataValue,
            onChainDataTimestamp,
            BigNumber.from(beaconUpdateData.newBeaconResponse.encodedValue),
            parseInt(beaconUpdateData.newBeaconResponse.timestamp, 10),
            chainId,
            beaconUpdateData.beaconTrigger,
            config?.monitoring?.deviationMultiplier,
            config?.monitoring?.heartbeatMultiplier
          ),
        ]);
        continue;
      }

      // Verify all conditions for beacon update are met otherwise skip
      const [log, { result }] = checkConditions(
        onChainDataValue,
        onChainDataTimestamp,
        parseInt(beaconUpdateData.newBeaconResponse.timestamp, 10),
        beaconUpdateData.beaconTrigger,
        beaconUpdateData.newBeaconValue
      );
      logger.logPending(log, beaconUpdateData.logOptionsBeaconId);
      if (!result) {
        continue;
      }

      beaconUpdateCalldatas = [
        ...beaconUpdateCalldatas,
        contract.interface.encodeFunctionData('updateBeaconWithSignedData', [
          beaconUpdateData.beacon.airnode,
          beaconUpdateData.beacon.templateId,
          beaconUpdateData.newBeaconResponse.timestamp,
          beaconUpdateData.newBeaconResponse.encodedValue,
          beaconUpdateData.newBeaconResponse.signature,
        ]),
      ];
    }

    if (monitorOnly) {
      continue;
    }

    let nonce = transactionCount;
    for (const updateBatch of chunk(beaconUpdateCalldatas, DATAFEED_UPDATE_BATCH_SIZE)) {
      // Get the latest gas price
      const getGasFn = () => getGasPrice(provider.rpcProvider.getProvider(), config.chains[chainId].options);
      // We have to grab the limiter from the custom provider as the getGasPrice function contains its own timeouts
      const [logs, gasTarget] = await provider.rpcProvider.getLimiter().schedule({ expiration: 30_000 }, getGasFn);
      logger.logPending(logs, logOptions);

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
export const updateBeaconSets = async (providerSponsorDataFeeds: ProviderSponsorDataFeeds, startTime: number) => {
  const initialUpdateData = await initializeUpdateCycle(providerSponsorDataFeeds, DataFeedType.BeaconSet, startTime);
  if (!initialUpdateData) return;
  const {
    contract,
    sponsorWallet,
    transactionCount,
    voidSigner,
    totalTimeout,
    logOptions,
    beaconValues,
    beaconSetTriggers,
    config,
    provider,
  } = initialUpdateData;
  const { chainId } = provider;

  const monitorOnly = config?.monitoring?.monitorOnly;

  type BeaconSetUpdateData = {
    logOptionsBeaconSetId: LogOptionsOverride;
    beaconSetTrigger: BeaconSetTrigger;
    dataFeedsCalldata: string;
  };

  // Process beacon set read calldatas
  const beaconSetUpdates: BeaconSetUpdateData[] = beaconSetTriggers.map((beaconSetTrigger) => {
    const logOptionsBeaconSetId = {
      ...logOptions,
      meta: {
        ...logOptions.meta,
        'Sponsor-Wallet': shortenAddress(sponsorWallet.address),
        'BeaconSet-ID': beaconSetTrigger.beaconSetId,
      },
    };

    logger.debug(`Processing beacon set update`, logOptionsBeaconSetId);

    return {
      logOptionsBeaconSetId,
      beaconSetTrigger,
      dataFeedsCalldata: contract.interface.encodeFunctionData('dataFeeds', [beaconSetTrigger.beaconSetId]),
    };
  });

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

    // Process beacon set update calldatas
    let beaconSetUpdateCalldatas: string[][] = [];

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
      const [onChainBeaconSetValue, onChainBeaconSetTimestamp] = ethers.utils.defaultAbiCoder.decode(
        ['int224', 'uint32'],
        beaconSetReturndata
      );

      const beaconSetBeaconIds = config.beaconSets[beaconSetUpdateData.beaconSetTrigger.beaconSetId];

      // Read beacon onchain values for current beacon set with a single tryMulticall call
      const readDataFeedWithIdCalldatas = beaconSetBeaconIds.map((beaconId) =>
        contract.interface.encodeFunctionData('readDataFeedWithId', [beaconId])
      );
      const goReadDataFeedWithIdTryMulticall = await go(
        () => contract.connect(voidSigner).callStatic.tryMulticall(Object.values(readDataFeedWithIdCalldatas)),
        {
          ...prepareGoOptions(startTime, totalTimeout),
          onAttemptError: (goError) =>
            logger.warn(
              `Failed attempt to read beacon data using multicall. Error ${goError.error}`,
              beaconSetUpdateData.logOptionsBeaconSetId
            ),
        }
      );
      if (!goReadDataFeedWithIdTryMulticall.success) {
        logger.warn(
          `Unable to read beacon data using multicall. Error: ${goReadDataFeedWithIdTryMulticall.error}`,
          beaconSetUpdateData.logOptionsBeaconSetId
        );
        continue;
      }
      const { successes: readDataFeedWithIdSuccesses, returndata: readDataFeedWithIdReturndatas } =
        goReadDataFeedWithIdTryMulticall.data;

      type BeaconSetBeaconUpdateData = {
        // These values are used to calculate the median value and timestamp prior to beacon set condition checks
        beaconSetBeaconValues: {
          value: ethers.BigNumber;
          timestamp: number;
        }[];
        // This array contains all the calldatas for updating beacon values
        updateBeaconWithSignedDataCalldatas: string[];
      };

      // Process each beacon in the current beacon set
      let beaconSetBeaconUpdateData: BeaconSetBeaconUpdateData = {
        beaconSetBeaconValues: [],
        updateBeaconWithSignedDataCalldatas: [],
      };
      let shouldSkipBeaconSetUpdate = false;
      for (let i = 0; i < beaconSetBeaconIds.length; i++) {
        const beaconId = beaconSetBeaconIds[i];
        const logOptionsBeaconId = {
          ...beaconSetUpdateData.logOptionsBeaconSetId,
          meta: {
            ...beaconSetUpdateData.logOptionsBeaconSetId.meta,
            'Beacon-ID': beaconId,
          },
        };

        // Cached API value
        const apiBeaconResponse: SignedData | undefined = beaconValues[beaconId];
        // Onchain beacon data
        const beaconReturndata = readDataFeedWithIdReturndatas[i];

        if (!apiBeaconResponse && !readDataFeedWithIdSuccesses[i]) {
          // There is no API data nor onchain value for current beacon
          // Therefore break this look and set the flag to skip the beacon set update
          logger.warn(`No beacon data. Error: ${beaconReturndata}`, logOptionsBeaconId);
          shouldSkipBeaconSetUpdate = true;
          break;
        }

        // Decode on-chain beacon returned by tryMulticall
        const [onChainBeaconValue, onChainBeaconTimestamp] = ethers.utils.defaultAbiCoder.decode(
          ['int224', 'uint32'],
          beaconReturndata
        );

        let value = onChainBeaconValue;
        let timestamp = onChainBeaconTimestamp;
        let calldata = undefined;
        if (apiBeaconResponse) {
          // There is a new beacon value in the API response
          const decodedValue = decodeBeaconValue(apiBeaconResponse.encodedValue);
          if (!decodedValue) {
            const message = `New beacon value is out of type range.`;
            logger.warn(message, logOptionsBeaconId);
            shouldSkipBeaconSetUpdate = true;
            break;
          }

          if (monitorOnly) {
            await Promise.allSettled([
              checkAndReport(
                'Beacon',
                beaconId,
                onChainBeaconValue,
                onChainBeaconTimestamp,
                decodedValue,
                parseInt(apiBeaconResponse.timestamp, 10),
                chainId,
                beaconSetUpdateData.beaconSetTrigger,
                config?.monitoring?.deviationMultiplier,
                config?.monitoring?.heartbeatMultiplier
              ),
            ]);
          } else {
            // Verify all conditions for beacon update are met
            // If condition check returns true then beacon update is required
            const [log, { result }] = checkConditions(
              onChainBeaconValue,
              onChainBeaconTimestamp,
              parseInt(apiBeaconResponse.timestamp, 10),
              beaconSetUpdateData.beaconSetTrigger,
              decodedValue
            );
            logger.logPending(log, logOptionsBeaconId);
            const { airnode, templateId } = config.beacons[beaconId];
            if (result) {
              value = decodedValue;
              timestamp = parseInt(apiBeaconResponse.timestamp, 10);
              calldata = contract.interface.encodeFunctionData('updateBeaconWithSignedData', [
                airnode,
                templateId,
                apiBeaconResponse.timestamp,
                apiBeaconResponse.encodedValue,
                apiBeaconResponse.signature,
              ]);
            }
          }
        }

        beaconSetBeaconUpdateData = {
          beaconSetBeaconValues: [...beaconSetBeaconUpdateData.beaconSetBeaconValues, { value, timestamp }],
          updateBeaconWithSignedDataCalldatas: [
            ...beaconSetBeaconUpdateData.updateBeaconWithSignedDataCalldatas,
            ...(calldata ? [calldata] : []),
          ],
        };
      }
      if (shouldSkipBeaconSetUpdate) {
        logger.warn('Missing beacon data.Skipping.', beaconSetUpdateData.logOptionsBeaconSetId);
        continue;
      }

      // https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/api3-server-v1/DataFeedServer.sol#L163
      const newBeaconSetValue = calculateMedian(
        beaconSetBeaconUpdateData.beaconSetBeaconValues.map((value) => value.value)
      );
      const newBeaconSetTimestamp = calculateMedian(
        beaconSetBeaconUpdateData.beaconSetBeaconValues.map((value) => ethers.BigNumber.from(value.timestamp))
      ).toNumber();

      if (monitorOnly) {
        await Promise.allSettled([
          checkAndReport(
            'Beacon',
            beaconSetUpdateData.beaconSetTrigger.beaconSetId,
            onChainBeaconSetValue,
            onChainBeaconSetTimestamp,
            newBeaconSetValue,
            newBeaconSetTimestamp,
            chainId,
            beaconSetUpdateData.beaconSetTrigger,
            config?.monitoring?.deviationMultiplier,
            config?.monitoring?.heartbeatMultiplier
          ),
        ]);
        continue;
      } else {
        // Verify all conditions for beacon set update are met otherwise skip
        const [log, { result }] = checkConditions(
          onChainBeaconSetValue,
          onChainBeaconSetTimestamp,
          newBeaconSetTimestamp,
          beaconSetUpdateData.beaconSetTrigger,
          newBeaconSetValue
        );
        logger.logPending(log, beaconSetUpdateData.logOptionsBeaconSetId);
        if (!result) {
          continue;
        }
      }

      beaconSetUpdateCalldatas = [
        ...beaconSetUpdateCalldatas,
        [
          ...beaconSetBeaconUpdateData.updateBeaconWithSignedDataCalldatas,
          // All beaconSet beaconIds must be passed in as an array because
          // the contract function derives the beaconSetId based on the beaconIds
          contract.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconSetBeaconIds]),
        ],
      ];
    }

    if (monitorOnly) {
      return;
    }

    let nonce = transactionCount;
    for (const beaconSetUpdateCalldata of beaconSetUpdateCalldatas) {
      // Get the latest gas price
      const getGasFn = () => getGasPrice(provider.rpcProvider.getProvider(), config.chains[chainId].options);
      // We have to grab the limiter from the custom provider as the getGasPrice function contains its own timeouts
      const [logs, gasTarget] = await provider.rpcProvider.getLimiter().schedule({ expiration: 30_000 }, getGasFn);
      logger.logPending(logs, logOptions);

      // Update beacon set batch onchain values
      const tx = await go(
        () => contract.connect(sponsorWallet).tryMulticall(beaconSetUpdateCalldata, { nonce, ...gasTarget }),
        {
          ...prepareGoOptions(startTime, totalTimeout),
          onAttemptError: (goError) =>
            logger.warn(`Failed attempt to update beacon set batch. Error ${goError.error}`, logOptions),
        }
      );
      if (!tx.success) {
        logger.warn(
          `Unable send beacon set batch update transaction with nonce ${nonce}. Error: ${tx.error}`,
          logOptions
        );
        return;
      }

      logger.info(
        `Beacon set batch update transaction was successfully sent with nonce ${nonce}. Tx hash ${tx.data.hash}.`,
        logOptions
      );
      nonce++;
    }
  }
};
