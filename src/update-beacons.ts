import { ethers } from 'ethers';
import { DapiServer__factory } from '@api3/airnode-protocol-v1';
import { go, GoAsyncOptions } from '@api3/promise-utils';
import { BeaconUpdate } from './validation';
import { getState, Provider } from './state';
import { getGasPrice } from './gas-prices';
import { getCurrentBlockNumber } from './block-number';
import { getTransactionCount } from './transaction-count';
import { checkUpdateCondition } from './check-condition';
import { deriveSponsorWalletFromMnemonic, shortenAddress, sleep } from './utils';
import {
  GAS_LIMIT,
  INFINITE_RETRIES,
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
      console.log(`Missing providers for chain with ID ${chainId}`);
      return acc;
    }

    const providerSponsorGroups = Object.entries(sponsors).reduce(
      (acc: ProviderSponsorBeacons[], [sponsorAddress, beaconUpdate]) => {
        const { beacons, updateInterval } = beaconUpdate;
        return [...acc, ...providers.map((provider) => ({ provider, sponsorAddress, updateInterval, beacons }))];
      },
      []
    );

    return [...acc, ...providerSponsorGroups];
  }, []);
};

export const initiateBeaconUpdates = () => {
  console.log('Initiating beacon updates');

  const providerSponsorBeaconsGroups = groupBeaconsByProviderSponsor();
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

const calculateCurrentTimeout = (startTime: number, totalTimeout: number) => totalTimeout - (Date.now() - startTime);

// We retry all chain operations with a random back-off infinitely until the next updates cycle
// TODO: Errors are not displayed with this approach. Problem?
const getCurrentProviderGoOptions = (startTime: number, totalTimeout: number): GoAsyncOptions => ({
  attemptTimeoutMs: PROVIDER_TIMEOUT_MS,
  totalTimeoutMs: calculateCurrentTimeout(startTime, totalTimeout),
  retries: INFINITE_RETRIES,
  delay: { type: 'random' as const, minDelayMs: RANDOM_BACKOFF_MIN_MS, maxDelayMs: RANDOM_BACKOFF_MAX_MS },
});

export const updateBeacons = async (providerSponsorBeacons: ProviderSponsorBeacons) => {
  const { config, beaconValues } = getState();
  const { provider, sponsorAddress, beacons } = providerSponsorBeacons;
  const { rpcProvider, chainId } = provider;
  console.log(
    `Processing beacon updates for chain with ID ${chainId} and sponsor with address ${providerSponsorBeacons.sponsorAddress}.`
  );

  const startTime = Date.now();
  // All the beacon updates for given provider & sponsor have up to <updateInterval> seconds to finish
  const totalTimeout = providerSponsorBeacons.updateInterval * 1_000;

  // Prepare contract for beacon updates
  const contractAddress = config.chains[chainId].contracts['DapiServer'];
  const contract = DapiServer__factory.connect(contractAddress, rpcProvider);
  // TODO: Should be later part of the validation
  if (!contractAddress) {
    console.log(`Missing contract address for DapiServer on chain with ID ${chainId}.`);
    return;
  }

  // Get current block number
  const blockNumber = await getCurrentBlockNumber(provider, getCurrentProviderGoOptions(startTime, totalTimeout));
  if (blockNumber === null) {
    console.log(`Unable to obtain block number for chain with ID ${chainId}.`);
    return;
  }

  // Get gas price
  const gasTarget = await getGasPrice(provider, getCurrentProviderGoOptions(startTime, totalTimeout));
  if (gasTarget === null) {
    console.log(`Unable to fetch gas price for chain with ID ${chainId}.`);
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
    getCurrentProviderGoOptions(startTime, totalTimeout)
  );
  if (transactionCount === null) {
    console.log(
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
      console.log(`Invalid beacon ID ${beaconUpdateData.beaconId}. Skipping.`);
      continue;
    }

    console.log(`Updating beacon with ID ${beaconUpdateData.beaconId}`);
    // Check whether we have a value for given beacon
    const newBeaconResponse = beaconValues[beaconUpdateData.beaconId];
    if (!newBeaconResponse) {
      console.log(`No data available for beacon with ID ${beaconUpdateData.beaconId}. Skipping.`);
      continue;
    }
    // TODO: What type should be used to decode the HTTP gateway response? Is `int224` correct? Is it the only type supported?
    const newBeaconValue = ethers.BigNumber.from(
      ethers.utils.defaultAbiCoder.decode(['int224'], newBeaconResponse.data.value)[0]
    );

    // Check beacon condition
    // TODO: Add retry and rest of the go options
    //       Will finish once https://github.com/api3dao/airseeker/pull/26 is merged
    const shouldUpdate = await checkUpdateCondition(
      voidSigner,
      contract,
      beaconUpdateData.beaconId,
      beaconUpdateData.deviationThreshold,
      newBeaconValue
    );
    if (!shouldUpdate) {
      console.log(`Deviation threshold not reached for beacon with ID ${beaconUpdateData.beaconId}. Skipping.`);
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
      getCurrentProviderGoOptions(startTime, totalTimeout)
    );

    if (!tx.success) {
      console.log(
        `Unable to update beacon with ID ${beaconUpdateData.beaconId} using wallet ${sponsorWallet.address} and nonce ${nonce}. Error: ${tx.error}`
      );
      return;
    }

    console.log(
      `Beacon with ID ${beaconUpdateData.beaconId} sucessfully updated with value ${newBeaconValue}. Tx hash ${tx.data.hash}.`
    );
    nonce++;
  }
};
