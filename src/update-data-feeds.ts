import { Api3ServerV1, Api3ServerV1__factory as Api3ServerV1Factory } from '@api3/airnode-protocol-v1';
import { getGasPrice } from '@api3/airnode-utilities';
import { go } from '@api3/promise-utils';
import { ethers } from 'ethers';
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
import { createDummyBeaconUpdateData, prepareGoOptions, shortenAddress, sleep } from './utils';
import { Beacon, BeaconSetTrigger, BeaconTrigger, SignedData } from './validation';

type ProviderSponsorDataFeeds = {
  provider: Provider;
  sponsorAddress: string;
  updateInterval: number;
  beaconTriggers: BeaconTrigger[];
  beaconSetTriggers: BeaconSetTrigger[];
};

type BeaconUpdate = {
  logOptionsBeaconId: LogOptionsOverride;
  beaconTrigger: BeaconTrigger;
  beacon: Beacon;
  newBeaconResponse: SignedData;
  newBeaconValue: ethers.BigNumber;
  dataFeedsCalldata: string;
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

const estimateBeaconMulticallGasLimit = async (
  contract: Api3ServerV1,
  calldatas: string[],
  logOptions: LogOptionsOverride
) => {
  const estimateGasMulticall = await go(() => contract.estimateGas.multicall(calldatas), {
    retries: 1,
  });
  if (estimateGasMulticall.success) {
    // Adding a extra 10% because multicall consumes less gas than tryMulticall
    return estimateGasMulticall.data.mul(ethers.BigNumber.from(Math.round(1.1 * 100))).div(ethers.BigNumber.from(100));
  }
  logger.warn(`Unable to estimate gas for multicall: ${estimateGasMulticall.error}`, logOptions);

  const estimateGasUpdateBeaconWithSignedData = await go(
    async () => {
      const { dummyAirnode, dummyBeaconTemplateId, dummyBeaconTimestamp, dummyBeaconData, dummyBeaconSignature } =
        await createDummyBeaconUpdateData();
      return contract.estimateGas.updateBeaconWithSignedData(
        dummyAirnode.address,
        dummyBeaconTemplateId,
        dummyBeaconTimestamp,
        dummyBeaconData,
        dummyBeaconSignature
      );
    },
    { retries: 1 }
  );
  if (estimateGasUpdateBeaconWithSignedData.success) {
    return estimateGasUpdateBeaconWithSignedData.data.mul(calldatas.length);
  }
  logger.warn(
    `Unable to estimate gas for updateBeaconWithSignedData: ${estimateGasUpdateBeaconWithSignedData.error}`,
    logOptions
  );

  return ethers.BigNumber.from(2_000_000);
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
      () =>
        contract
          .connect(voidSigner)
          .callStatic.tryMulticall(readBatch.map((beaconUpdate) => beaconUpdate.dataFeedsCalldata)),
      {
        ...prepareGoOptions(startTime, totalTimeout),
        onAttemptError: (goError) =>
          logger.warn(`Attempt to read beacon data using tryMulticall has failed. Error ${goError.error}`, logOptions),
      }
    );
    if (!goDatafeedsTryMulticall.success) {
      logger.warn(`Unable to read beacon data using tryMulticall. Error: ${goDatafeedsTryMulticall.error}`, logOptions);
      continue;
    }

    const { successes, returndata } = goDatafeedsTryMulticall.data;

    // Process beacon update calldatas
    let beaconUpdates: BeaconUpdate[] = [];

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

      // Verify all conditions for beacon update are met otherwise skip
      const [log, result] = checkConditions(
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

      beaconUpdates = [...beaconUpdates, beaconUpdateData];
    }

    let nonce = transactionCount;
    for (const updateBatch of chunk(beaconUpdates, DATAFEED_UPDATE_BATCH_SIZE)) {
      const getGasFn = () => getGasPrice(provider.rpcProvider.getProvider(), config.chains[chainId].options);
      // We have to grab the limiter from the custom provider as the getGasPrice function contains its own timeouts
      const [logs, gasTarget] = await provider.rpcProvider.getLimiter().schedule({ expiration: 30_000 }, getGasFn);
      logger.logPending(logs, logOptions);

      // Update beacon onchain values
      const updateBatchBeaconIds = updateBatch.map((beaconUpdate) => beaconUpdate.beaconTrigger.beaconId);
      logger.debug(
        `About to update ${updateBatch.length} beacon(s) with nonce ${nonce}. Beacon id(s): ${updateBatchBeaconIds.join(
          ', '
        )}`,
        logOptions
      );

      let updateFn;
      if (updateBatch.length === 1) {
        updateFn = () =>
          contract
            .connect(sponsorWallet)
            .updateBeaconWithSignedData(
              beaconUpdates[0].beacon.airnode,
              beaconUpdates[0].beacon.templateId,
              beaconUpdates[0].newBeaconResponse.timestamp,
              beaconUpdates[0].newBeaconResponse.encodedValue,
              beaconUpdates[0].newBeaconResponse.signature,
              { nonce, ...gasTarget }
            );
      } else {
        const calldatas = updateBatch.map((beaconUpdateData) =>
          contract.interface.encodeFunctionData('updateBeaconWithSignedData', [
            beaconUpdateData.beacon.airnode,
            beaconUpdateData.beacon.templateId,
            beaconUpdateData.newBeaconResponse.timestamp,
            beaconUpdateData.newBeaconResponse.encodedValue,
            beaconUpdateData.newBeaconResponse.signature,
          ])
        );

        const gasLimit =
          gasTarget.gasLimit ??
          (await estimateBeaconMulticallGasLimit(contract.connect(sponsorWallet), calldatas, logOptions));
        logger.debug(`Gas limit: ${gasLimit.toString()}`, logOptions);

        updateFn = () =>
          contract.connect(sponsorWallet).tryMulticall(calldatas, {
            nonce,
            ...gasTarget,
            gasLimit,
          });
      }

      const tx = await go(updateFn, {
        ...prepareGoOptions(startTime, totalTimeout),
        onAttemptError: (goError) =>
          logger.warn(
            `Attempt to send transaction to update ${updateBatch.length} beacon(s) has failed. Error ${goError.error}`,
            logOptions
          ),
      });
      if (!tx.success) {
        logger.warn(
          `Unable send transaction to update ${updateBatch.length} beacon(s) with nonce ${nonce}. Error: ${tx.error}`,
          logOptions
        );
        logger.debug(`Beacon id(s) that failed to be updated: ${updateBatchBeaconIds.join(', ')}`, logOptions);
        return;
      }
      logger.info(
        `Transaction to update ${updateBatch.length} beacon(s) was successfully sent with nonce ${nonce}. Tx hash ${tx.data.hash}`,
        logOptions
      );

      nonce++;
    }
  }
};

const estimateBeaconSetMulticallGasLimit = async (
  contract: Api3ServerV1,
  calldatas: string[],
  beaconIds: string[],
  logOptions: LogOptionsOverride
) => {
  const estimateGasMulticall = await go(() => contract.estimateGas.multicall(calldatas), { retries: 1 });
  if (estimateGasMulticall.success) {
    // Adding a extra 10% because multicall consumes less gas than tryMulticall
    return estimateGasMulticall.data.mul(ethers.BigNumber.from(Math.round(1.1 * 100))).div(ethers.BigNumber.from(100));
  }
  logger.warn(`Unable to estimate gas for multicall: ${estimateGasMulticall.error}`, logOptions);

  const estimatedGas = await go(
    async () => {
      const { dummyAirnode, dummyBeaconTemplateId, dummyBeaconTimestamp, dummyBeaconData, dummyBeaconSignature } =
        await createDummyBeaconUpdateData();
      return [
        await contract.estimateGas.updateBeaconWithSignedData(
          dummyAirnode.address,
          dummyBeaconTemplateId,
          dummyBeaconTimestamp,
          dummyBeaconData,
          dummyBeaconSignature
        ),
        await contract.estimateGas.updateBeaconSetWithBeacons(beaconIds),
      ];
    },
    { retries: 1 }
  );
  if (estimatedGas.success) {
    const [estimatedGasUpdateBeaconWithSignedData, estimatedGasUpdateBeaconSetWithBeacons] = estimatedGas.data;

    return estimatedGasUpdateBeaconWithSignedData.mul(beaconIds.length).add(estimatedGasUpdateBeaconSetWithBeacons);
  }
  logger.warn(
    `Unable to estimate gas for updateBeaconWithSignedData and updateBeaconWithSignedData: ${estimatedGas.error}`,
    logOptions
  );

  return ethers.BigNumber.from(2_000_000);
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

    type BeaconSetBeaconUpdate = Pick<Beacon, 'airnode' | 'templateId'> & SignedData;
    type BeaconSetUpdate = { beaconIds: string[]; beaconSetBeaconUpdates: BeaconSetBeaconUpdate[] };

    // Process beacon set update
    let beaconSetUpdates: BeaconSetUpdate[] = [];

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
        beaconValues: {
          value: ethers.BigNumber;
          timestamp: number;
        }[];
        // This array contains all data for updating beacon set beacons with signed data
        beaconUpdates: BeaconSetBeaconUpdate[];
      };

      // Process each beacon in the current beacon set
      let beaconSetBeaconUpdateData: BeaconSetBeaconUpdateData = {
        beaconValues: [],
        beaconUpdates: [],
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
        let beaconUpdate: BeaconSetBeaconUpdate | null = null;
        if (apiBeaconResponse) {
          // There is a new beacon value in the API response
          const decodedValue = decodeBeaconValue(apiBeaconResponse.encodedValue);
          if (!decodedValue) {
            const message = `New beacon value is out of type range.`;
            logger.warn(message, logOptionsBeaconId);
            shouldSkipBeaconSetUpdate = true;
            break;
          }

          const { airnode, templateId } = config.beacons[beaconId];

          value = decodedValue;
          timestamp = parseInt(apiBeaconResponse.timestamp, 10);
          beaconUpdate = {
            airnode,
            templateId,
            ...apiBeaconResponse,
          };
        }

        beaconSetBeaconUpdateData = {
          beaconValues: [...beaconSetBeaconUpdateData.beaconValues, { value, timestamp }],
          beaconUpdates: [...beaconSetBeaconUpdateData.beaconUpdates, ...(beaconUpdate ? [beaconUpdate] : [])],
        };
      }
      if (shouldSkipBeaconSetUpdate) {
        logger.warn('Missing beacon data.Skipping.', beaconSetUpdateData.logOptionsBeaconSetId);
        continue;
      }

      // https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/api3-server-v1/DataFeedServer.sol#L163
      const newBeaconSetValue = calculateMedian(beaconSetBeaconUpdateData.beaconValues.map((value) => value.value));
      const newBeaconSetTimestamp = calculateMedian(
        beaconSetBeaconUpdateData.beaconValues.map((value) => ethers.BigNumber.from(value.timestamp))
      ).toNumber();

      // Verify all conditions for beacon set update are met otherwise skip
      const [log, result] = checkConditions(
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

      beaconSetUpdates = [
        ...beaconSetUpdates,
        { beaconIds: beaconSetBeaconIds, beaconSetBeaconUpdates: beaconSetBeaconUpdateData.beaconUpdates },
      ];
    }

    let nonce = transactionCount;
    // For beacon sets, we send a single transaction per beacon set by multicalling the update of each beacon plus the beacon set update
    for (const beaconSetUpdate of beaconSetUpdates) {
      const getGasFn = () => getGasPrice(provider.rpcProvider.getProvider(), config.chains[chainId].options);
      // We have to grab the limiter from the custom provider as the getGasPrice function contains its own timeouts
      const [logs, gasTarget] = await provider.rpcProvider.getLimiter().schedule({ expiration: 30_000 }, getGasFn);
      logger.logPending(logs, logOptions);

      const beaconSetUpdateCalldatas = [
        ...beaconSetUpdate.beaconSetBeaconUpdates.map((beaconSetBeaconUpdate) =>
          contract.interface.encodeFunctionData('updateBeaconWithSignedData', [
            beaconSetBeaconUpdate.airnode,
            beaconSetBeaconUpdate.templateId,
            beaconSetBeaconUpdate.timestamp,
            beaconSetBeaconUpdate.encodedValue,
            beaconSetBeaconUpdate.signature,
          ])
        ),
        contract.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconSetUpdate.beaconIds]),
      ];

      const gasLimit =
        gasTarget.gasLimit ??
        (await estimateBeaconSetMulticallGasLimit(
          contract.connect(sponsorWallet),
          beaconSetUpdateCalldatas,
          beaconSetUpdate.beaconIds,
          logOptions
        ));
      logger.debug(`Gas limit: ${gasLimit.toString()}`, logOptions);

      // Update beacon set batch onchain values
      const tx = await go(
        () => contract.connect(sponsorWallet).tryMulticall(beaconSetUpdateCalldatas, { nonce, ...gasTarget, gasLimit }),
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
