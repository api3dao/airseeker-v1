import * as node from '@api3/airnode-node';
import { DapiServer, DapiServer__factory as DapiServerFactory } from '@api3/airnode-protocol-v1';
import { go, GoAsyncOptions } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { isEmpty } from 'lodash';
import { getCurrentBlockNumber } from './block-number';
import { checkOnchainDataFreshness, checkSignedDataFreshness, checkUpdateCondition } from './check-condition';
import { INT224_MAX, INT224_MIN, NO_BEACONS_EXIT_CODE, PROTOCOL_ID } from './constants';
import { getChainProviderGasPrice } from './gas-oracle';
import { logger, LogOptionsOverride } from './logging';
import { getState, Provider } from './state';
import { getTransactionCount } from './transaction-count';
import { shortenAddress, sleep, prepareGoOptions } from './utils';
import { BeaconUpdate } from './validation';

type ProviderSponsorBeacons = {
  provider: Provider;
  sponsorAddress: string;
  updateInterval: number;
  beacons: BeaconUpdate[];
};

export const groupBeaconsByProviderSponsor = () => {
  const { config, providers: stateProviders } = getState();
  return Object.entries(config.triggers.beaconUpdates).reduce(
    (acc: ProviderSponsorBeacons[], [chainId, beaconUpdatesPerSponsor]) => {
      const providers = stateProviders[chainId];

      const providerSponsorGroups = Object.entries(beaconUpdatesPerSponsor).reduce(
        (acc: ProviderSponsorBeacons[], [sponsorAddress, beaconUpdate]) => {
          return [...acc, ...providers.map((provider) => ({ provider, sponsorAddress, ...beaconUpdate }))];
        },
        []
      );

      return [...acc, ...providerSponsorGroups];
    },
    []
  );
};

export const initiateBeaconUpdates = () => {
  logger.debug('Initiating beacon updates');

  const providerSponsorBeaconsGroups = groupBeaconsByProviderSponsor();
  if (isEmpty(providerSponsorBeaconsGroups)) {
    logger.error('No beacons for processing found. Stopping.');
    process.exit(NO_BEACONS_EXIT_CODE);
  }
  providerSponsorBeaconsGroups.forEach(updateBeaconsInLoop);
};

export const updateBeaconsInLoop = async (providerSponsorBeacons: ProviderSponsorBeacons) => {
  while (!getState().stopSignalReceived) {
    const startTimestamp = Date.now();
    const { updateInterval } = providerSponsorBeacons;

    await updateBeacons(providerSponsorBeacons);

    const duration = Date.now() - startTimestamp;
    const waitTime = Math.max(0, updateInterval * 1_000 - duration);
    await sleep(waitTime);
  }
};

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const updateBeacons = async (providerSponsorBeacons: ProviderSponsorBeacons) => {
  const { config, beaconValues } = getState();
  const { provider, sponsorAddress, beacons } = providerSponsorBeacons;
  const { rpcProvider, chainId, providerName } = provider;
  const logOptionsSponsor = {
    meta: { chainId, providerName },
    additional: { Sponsor: shortenAddress(sponsorAddress) },
  };
  logger.debug(`Processing beacon updates`, logOptionsSponsor);

  const startTime = Date.now();
  // All the beacon updates for given provider & sponsor have up to <updateInterval> seconds to finish
  const totalTimeout = providerSponsorBeacons.updateInterval * 1_000;

  // Prepare contract for beacon updates
  const contractAddress = config.chains[chainId].contracts['DapiServer'];
  const contract = DapiServerFactory.connect(contractAddress, rpcProvider);

  // Get current block number
  const blockNumber = await getCurrentBlockNumber(provider, prepareGoOptions(startTime, totalTimeout));
  if (blockNumber === null) {
    logger.warn(`Unable to obtain block number`, logOptionsSponsor);
    return;
  }

  // Derive sponsor wallet address
  const sponsorWallet = node.evm
    .deriveSponsorWalletFromMnemonic(config.airseekerWalletMnemonic, sponsorAddress, PROTOCOL_ID)
    .connect(rpcProvider);

  // Get transaction count
  const transactionCount = await getTransactionCount(
    provider,
    sponsorWallet.address,
    blockNumber,
    prepareGoOptions(startTime, totalTimeout)
  );
  if (transactionCount === null) {
    logger.warn(`Unable to fetch transaction count`, logOptionsSponsor);
    return;
  }

  // Process beacon updates
  let nonce = transactionCount;
  const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, rpcProvider);

  for (const beacon of beacons) {
    const logOptionsBeaconId = {
      ...logOptionsSponsor,
      additional: {
        ...logOptionsSponsor.additional,
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
      continue;
    }

    // Based on https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/dapis/DapiServer.sol#L878
    const newBeaconValue = ethers.BigNumber.from(
      ethers.utils.defaultAbiCoder.decode(['int256'], newBeaconResponse.data.value)[0]
    );
    if (newBeaconValue.gt(INT224_MAX) || newBeaconValue.lt(INT224_MIN)) {
      logger.warn(`New beacon value is out of type range. Skipping.`, logOptionsBeaconId);
      continue;
    }

    const onChainData = await readOnChainBeaconData(
      voidSigner,
      contract,
      beaconUpdateData.beaconId,
      prepareGoOptions(startTime, totalTimeout),
      logOptionsBeaconId
    );
    if (!onChainData) {
      continue;
    }

    // Check that signed data is newer than on chain value
    const isSignedDataFresh = checkSignedDataFreshness(onChainData.timestamp, newBeaconResponse.data.timestamp);
    if (!isSignedDataFresh) {
      logger.warn(`Signed data older than on chain record. Skipping.`, logOptionsBeaconId);
      continue;
    }

    // Check that on chain data is newer than hearbeat interval
    const isOnchainDataFresh = checkOnchainDataFreshness(onChainData.timestamp, beaconUpdateData.heartbeatInterval);
    if (!isOnchainDataFresh) {
      logger.info(
        `On chain data timestamp older than heartbeat. Updating without condition check.`,
        logOptionsBeaconId
      );
    } else {
      // Check beacon condition
      const shouldUpdate = await checkUpdateCondition(
        onChainData.value,
        beaconUpdateData.deviationThreshold,
        newBeaconValue
      );
      if (shouldUpdate === null) {
        logger.warn(`Unable to fetch current beacon value`, logOptionsBeaconId);
        // This can happen only if we reach the total timeout so it makes no sense to continue with the rest of the beacons
        return;
      }
      if (!shouldUpdate) {
        logger.info(`Deviation threshold not reached. Skipping.`, logOptionsBeaconId);
        continue;
      }

      logger.info(`Deviation threshold reached. Updating.`, logOptionsBeaconId);
    }

    // Get gas price from oracle
    const gasPrice = getChainProviderGasPrice(chainId, providerName);

    // Update beacon
    const tx = await go(
      () =>
        contract
          .connect(sponsorWallet)
          .updateBeaconWithSignedData(
            beaconUpdateData.airnode,
            beaconUpdateData.templateId,
            newBeaconResponse.data.timestamp,
            newBeaconResponse.data.value,
            newBeaconResponse.signature,
            {
              gasLimit: ethers.BigNumber.from(config.chains[chainId].options.fulfillmentGasLimit),
              gasPrice,
              nonce,
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
      return;
    }

    logger.info(
      `Beacon successfully updated with value ${newBeaconValue}. Tx hash ${tx.data.hash}.`,
      logOptionsBeaconId
    );
    nonce++;
  }
};

export interface OnChainBeaconData {
  value: ethers.BigNumber;
  timestamp: number;
}

export const readOnChainBeaconData = async (
  voidSigner: ethers.VoidSigner,
  dapiServer: DapiServer,
  beaconId: string,
  goOptions: GoAsyncOptions,
  logOptions: LogOptionsOverride
): Promise<OnChainBeaconData | null> => {
  const logOptionsDapiServerAddress = {
    ...logOptions,
    additional: { ...logOptions.additional, 'Dapi-Server': dapiServer.address },
  };

  const goDataFeed = await go(() => dapiServer.connect(voidSigner).readDataFeedWithId(beaconId), {
    ...goOptions,
    onAttemptError: (goError) =>
      logger.warn(`Failed attempt to read data feed. Error: ${goError.error}`, logOptionsDapiServerAddress),
  });
  if (!goDataFeed.success) {
    logger.warn(`Unable to read data feed. Error: ${goDataFeed.error}`, logOptionsDapiServerAddress);
    return null;
  }

  return goDataFeed.data;
};
