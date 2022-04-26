import { ethers } from 'ethers';
import { isEmpty } from 'lodash';
import { DapiServer__factory as DapiServerFactory } from '@api3/airnode-protocol-v1';
import { go, GoAsyncOptions } from '@api3/promise-utils';
import { BeaconUpdate } from './validation';
import { getState, Provider } from './state';
import { logger } from './logging';
import { getGasPrice } from './gas-prices';
import { getCurrentBlockNumber } from './block-number';
import { getTransactionCount } from './transaction-count';
import { checkUpdateCondition } from './check-condition';
import { deriveSponsorWalletFromMnemonic, shortenAddress, sleep } from './utils';
import {
  GAS_LIMIT,
  INFINITE_RETRIES,
  INT224_MAX,
  INT224_MIN,
  NO_BEACONS_EXIT_CODE,
  PROTOCOL_ID,
  PROVIDER_TIMEOUT_MS,
  RANDOM_BACKOFF_MAX_MS,
  RANDOM_BACKOFF_MIN_MS,
} from './constants';

type ProviderSponsorBeacons = {
  provider: Provider;
  sponsorAddress: string;
  updateInterval: number;
  beacons: BeaconUpdate[];
};

const groupBeaconsByProviderSponsor = () => {
  const { config, providers: stateProviders } = getState();
  return Object.entries(config.triggers.beaconUpdates).reduce((acc: ProviderSponsorBeacons[], [chainId, sponsors]) => {
    const providers = stateProviders[chainId];

    // TODO: Should be later part of the validation
    if (!providers) {
      logger.log(`Missing providers for chain with ID ${chainId}`);
      return acc;
    }

    const providerSponsorGroups = Object.entries(sponsors).reduce(
      (acc: ProviderSponsorBeacons[], [sponsorAddress, beaconUpdate]) => {
        const { beacons } = beaconUpdate;
        // TODO: Should be later part of the validation
        const foundBeacons = beacons.filter((beacon) => {
          if (config.beacons[beacon.beaconId]) return true;

          logger.log(`Missing beacon with ID ${beacon.beaconId}. Skipping.`);
          return false;
        });

        if (isEmpty(foundBeacons)) return acc;

        return [
          ...acc,
          ...providers.map((provider) => ({ provider, sponsorAddress, ...beaconUpdate, beacons: foundBeacons })),
        ];
      },
      []
    );

    return [...acc, ...providerSponsorGroups];
  }, []);
};

export const initiateBeaconUpdates = () => {
  logger.log('Initiating beacon updates');

  const providerSponsorBeaconsGroups = groupBeaconsByProviderSponsor();
  if (isEmpty(providerSponsorBeaconsGroups)) {
    logger.log('No beacons for processing found. Stopping.');
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

const calculateTimeout = (startTime: number, totalTimeout: number) => totalTimeout - (Date.now() - startTime);

// We retry all chain operations with a random back-off infinitely until the next updates cycle
// TODO: Errors are not displayed with this approach. Problem?
const prepareGoOptions = (startTime: number, totalTimeout: number): GoAsyncOptions => ({
  attemptTimeoutMs: PROVIDER_TIMEOUT_MS,
  totalTimeoutMs: calculateTimeout(startTime, totalTimeout),
  retries: INFINITE_RETRIES,
  delay: { type: 'random' as const, minDelayMs: RANDOM_BACKOFF_MIN_MS, maxDelayMs: RANDOM_BACKOFF_MAX_MS },
});

// We pass return value from `prepareGoOptions` (with calculated timeout) to every `go` call in the function to enforce the update cycle.
// This solution is not precise but since chain operations are the only ones that actually take some time this should be a good enough solution.
export const updateBeacons = async (providerSponsorBeacons: ProviderSponsorBeacons) => {
  const { config, beaconValues } = getState();
  const { provider, sponsorAddress, beacons } = providerSponsorBeacons;
  const { rpcProvider, chainId } = provider;
  logger.log(
    `Processing beacon updates for chain with ID ${chainId} and sponsor with address ${providerSponsorBeacons.sponsorAddress}.`
  );

  const startTime = Date.now();
  // All the beacon updates for given provider & sponsor have up to <updateInterval> seconds to finish
  const totalTimeout = providerSponsorBeacons.updateInterval * 1_000;

  // Prepare contract for beacon updates
  const contractAddress = config.chains[chainId].contracts['DapiServer'];
  // TODO: Should be later part of the validation
  if (!contractAddress) {
    logger.log(`Missing contract address for DapiServer on chain with ID ${chainId}.`);
    return;
  }
  const contract = DapiServerFactory.connect(contractAddress, rpcProvider);

  // Get current block number
  const blockNumber = await getCurrentBlockNumber(provider, prepareGoOptions(startTime, totalTimeout));
  if (blockNumber === null) {
    logger.log(`Unable to obtain block number for chain with ID ${chainId}.`);
    return;
  }

  // Get gas price
  const gasTarget = await getGasPrice(provider, prepareGoOptions(startTime, totalTimeout));
  if (gasTarget === null) {
    logger.log(`Unable to fetch gas price for chain with ID ${chainId}.`);
    return;
  }
  const { txType: _txType, ...gatTargetOverride } = gasTarget;

  // Derive sponsor wallet address
  const sponsorWallet = deriveSponsorWalletFromMnemonic(
    config.airseekerWalletMnemonic,
    sponsorAddress,
    PROTOCOL_ID
  ).connect(rpcProvider);

  // Get transaction count
  const transactionCount = await getTransactionCount(
    rpcProvider,
    sponsorWallet.address,
    blockNumber,
    prepareGoOptions(startTime, totalTimeout)
  );
  if (transactionCount === null) {
    logger.log(
      `Unable to fetch transaction count for sponsor ${shortenAddress(sponsorAddress)} on chain with ID ${chainId}.`
    );
    return;
  }

  // Process beacon updates
  let nonce = transactionCount;
  const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, rpcProvider);

  for (const beacon of beacons) {
    const beaconUpdateData = { ...beacon, ...config.beacons[beacon.beaconId] };

    // TODO: Should be later part of the validation
    const derivedBeaconId = ethers.utils.solidityKeccak256(
      ['address', 'bytes32'],
      [beaconUpdateData.airnode, beaconUpdateData.templateId]
    );
    if (derivedBeaconId !== beaconUpdateData.beaconId) {
      logger.log(`Invalid beacon ID ${beaconUpdateData.beaconId}. Skipping.`);
      continue;
    }

    logger.log(`Updating beacon with ID ${beaconUpdateData.beaconId}`);
    // Check whether we have a value for given beacon
    const newBeaconResponse = beaconValues[beaconUpdateData.beaconId];
    if (!newBeaconResponse) {
      logger.log(`No data available for beacon with ID ${beaconUpdateData.beaconId}. Skipping.`);
      continue;
    }

    // Based on https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/dapis/DapiServer.sol#L878
    const newBeaconValue = ethers.BigNumber.from(
      ethers.utils.defaultAbiCoder.decode(['int256'], newBeaconResponse.data.value)[0]
    );
    if (newBeaconValue.gt(INT224_MAX) || newBeaconValue.lt(INT224_MIN)) {
      logger.log(`New beacon value for beacon with ID ${beaconUpdateData.beaconId} is out of type range. Skipping.`);
      continue;
    }

    // Check beacon condition
    const shouldUpdate = await checkUpdateCondition(
      voidSigner,
      contract,
      beaconUpdateData.beaconId,
      beaconUpdateData.deviationThreshold,
      newBeaconValue,
      prepareGoOptions(startTime, totalTimeout)
    );
    if (shouldUpdate === null) {
      logger.log(`Unable to fetch current beacon value for beacon with ID ${beaconUpdateData.beaconId}.`);
      // This can happen only if we reach the total timeout so it makes no sense to continue with the rest of the beacons
      return;
    }
    if (!shouldUpdate) {
      logger.log(`Deviation threshold not reached for beacon with ID ${beaconUpdateData.beaconId}. Skipping.`);
      continue;
    }

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
              gasLimit: GAS_LIMIT,
              ...gatTargetOverride,
              nonce,
            }
          ),
      {
        ...prepareGoOptions(startTime, totalTimeout),
        onAttemptError: (goError) => logger.log(`Failed attempt to update beacon. Error ${goError.error}`),
      }
    );

    if (!tx.success) {
      logger.log(
        `Unable to update beacon with ID ${beaconUpdateData.beaconId} using wallet ${sponsorWallet.address} and nonce ${nonce}. Error: ${tx.error}`
      );
      return;
    }

    logger.log(
      `Beacon with ID ${beaconUpdateData.beaconId} sucessfully updated with value ${newBeaconValue}. Tx hash ${tx.data.hash}.`
    );
    nonce++;
  }
};
