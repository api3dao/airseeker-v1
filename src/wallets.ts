import * as node from '@api3/airnode-node';
import * as protocol from '@api3/airnode-protocol';
import { Api3ServerV1__factory } from '@api3/airnode-protocol-v1';
import { go, goSync } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { uniq } from 'lodash';
import { LogOptionsOverride, logger } from './logging';
import { RateLimitedProvider } from './providers';
import { Provider, SponsorWalletsPrivateKey, getState, updateState } from './state';
import { createDummyBeaconUpdateData, shortenAddress } from './utils';
import { DataFeedUpdates } from './validation';

export type ChainSponsorGroup = {
  chainId: string;
  providers: Provider[];
  sponsorAddress: string;
  api3ServerV1Address: string;
  fulfillmentGasLimit?: number;
};

export type SponsorBalanceStatus = {
  chainId: string;
  sponsorAddress: string;
  hasEnoughBalance: boolean;
};

export const initializeAirseekerWallet = () => {
  const { config } = getState();

  // Derive airseeker wallet
  const airseekerWalletPrivateKey = ethers.Wallet.fromMnemonic(config.airseekerWalletMnemonic).privateKey;

  updateState((state) => ({ ...state, airseekerWalletPrivateKey }));
};

export const initializeSponsorWallets = () => {
  const { config } = getState();

  // Derive sponsor wallets
  const groupSponsorsByChain = Object.values(config.triggers.dataFeedUpdates);
  const uniqueSponsors = uniq(groupSponsorsByChain.flatMap(Object.keys));

  const sponsorWalletsPrivateKey: SponsorWalletsPrivateKey = Object.fromEntries(
    uniqueSponsors.map((sponsorAddress) => [
      sponsorAddress,
      node.evm.deriveSponsorWalletFromMnemonic(
        config.airseekerWalletMnemonic,
        sponsorAddress,
        protocol.PROTOCOL_IDS.AIRSEEKER
      ).privateKey,
    ])
  );

  updateState((state) => ({ ...state, sponsorWalletsPrivateKey }));
};

export const retrieveSponsorWallet = (sponsorAddress: string): ethers.Wallet => {
  const { sponsorWalletsPrivateKey } = getState();
  if (!sponsorWalletsPrivateKey || !sponsorWalletsPrivateKey[sponsorAddress])
    throw new Error(`Pre-generated private key not found for sponsor ${sponsorAddress}`);
  return new ethers.Wallet(sponsorWalletsPrivateKey[sponsorAddress]);
};

const getMantleGasPrice = async (provider: RateLimitedProvider) => {
  const goRes = await go(() => provider.send('rollup_gasPrices', []));
  if (!goRes.success) throw goRes.error;

  const l1GasPrice = ethers.BigNumber.from(goRes.data.l1GasPrice);
  const l2GasPrice = ethers.BigNumber.from(goRes.data.l2GasPrice);

  return l1GasPrice.add(l2GasPrice);
};

const getGasPrice = async (provider: RateLimitedProvider) => {
  switch (provider.network.chainId) {
    case 5000:
    case 5001:
      return getMantleGasPrice(provider);
    default:
      return provider.getGasPrice();
  }
};

export const hasEnoughBalance = async (
  sponsorWallet: ethers.Wallet,
  dummyAirnode: ethers.Wallet,
  api3ServerV1: ethers.Contract,
  fulfillmentGasLimit: number | undefined,
  logOptions: LogOptionsOverride
): Promise<boolean> => {
  // Fetch current sponsorWallet balance
  const goGetBalance = await go(() => sponsorWallet.getBalance(), { retries: 1 });
  if (!goGetBalance.success) {
    logger.error("Failed to get sponsorWallet's balance", goGetBalance.error, logOptions);
    throw new Error(goGetBalance.error.message);
  }
  const balance = goGetBalance.data;

  // Get the gas price from provider
  const goGasPrice = await go(() => getGasPrice(sponsorWallet.provider as RateLimitedProvider), { retries: 1 });
  if (!goGasPrice.success) {
    logger.error('Failed to get chain gas price', goGasPrice.error, logOptions);
    throw new Error(goGasPrice.error.message);
  }
  const gasPrice = goGasPrice.data;

  let estimatedGas: ethers.BigNumber;
  if (fulfillmentGasLimit) {
    estimatedGas = ethers.BigNumber.from(fulfillmentGasLimit);
  } else {
    // Estimate the units of gas required for updating a single dummy beacon with signed data
    const goEstimateGas = await go(
      async () => {
        const { dummyBeaconTemplateId, dummyBeaconTimestamp, dummyBeaconData, dummyBeaconSignature } =
          await createDummyBeaconUpdateData(dummyAirnode);
        return api3ServerV1
          .connect(sponsorWallet)
          .estimateGas.updateBeaconWithSignedData(
            dummyAirnode.address,
            dummyBeaconTemplateId,
            dummyBeaconTimestamp,
            dummyBeaconData,
            dummyBeaconSignature
          );
      },
      { retries: 1 }
    );
    if (!goEstimateGas.success) {
      logger.error('Failed to get gas estimate', goEstimateGas.error, logOptions);
      throw new Error(goEstimateGas.error.message);
    }
    estimatedGas = goEstimateGas.data;
  }

  logger.info(`Current balance: ${ethers.utils.formatEther(balance)} ether`, logOptions);
  logger.info(`Current gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`, logOptions);
  logger.info(`Estimated gas needed: ${estimatedGas.toString()}`, logOptions);

  // Check if the current balance is enough to cover the estimated gas cost
  return balance.gte(estimatedGas.mul(gasPrice));
};

export const getSponsorBalanceStatus = async (
  chainSponsorGroup: ChainSponsorGroup,
  dummyAirnode: ethers.Wallet
): Promise<SponsorBalanceStatus | null> => {
  const { chainId, providers, sponsorAddress, api3ServerV1Address, fulfillmentGasLimit } = chainSponsorGroup;

  const logOptions = {
    meta: { 'Chain-ID': chainId, Sponsor: shortenAddress(sponsorAddress) },
  };

  const goResult = goSync(() => retrieveSponsorWallet(sponsorAddress));
  if (!goResult.success) {
    const message = `Failed to retrieve wallet address for sponsor ${sponsorAddress}. Skipping. Error: ${goResult.error.message}`;
    logger.warn(message, logOptions);
    return null;
  }
  const sponsorWallet = goResult.data;

  const api3ServerV1 = new Api3ServerV1__factory().attach(api3ServerV1Address);

  const hasEnoughBalancePromises = providers.map(async ({ rpcProvider, providerName }) =>
    hasEnoughBalance(sponsorWallet.connect(rpcProvider), dummyAirnode, api3ServerV1, fulfillmentGasLimit, {
      meta: { ...logOptions.meta, 'Sponsor-Wallet': shortenAddress(sponsorWallet.address), Provider: providerName },
    })
  );
  const goAnyResult = await go(() => Promise.any(hasEnoughBalancePromises));

  if (!goAnyResult.success) {
    const message = `Failed to check if sponsor wallet balance is enough for ${sponsorWallet.address}. No provider was resolved`;
    logger.warn(message, logOptions);
    return null;
  }

  return { chainId, sponsorAddress, hasEnoughBalance: goAnyResult.data };
};

export const filterSponsorWallets = async () => {
  const { config, providers: stateProviders, sponsorWalletsPrivateKey } = getState();

  const chainSponsorGroups = Object.entries(config.triggers.dataFeedUpdates).reduce(
    (acc: ChainSponsorGroup[], [chainId, dataFeedUpdatesPerSponsor]) => {
      const providers = stateProviders[chainId];
      const fulfillmentGasLimit = config.chains[chainId].options.fulfillmentGasLimit;
      const api3ServerV1Address = config.chains[chainId].contracts['Api3ServerV1'];
      const providersSponsorGroups = Object.keys(dataFeedUpdatesPerSponsor).map((sponsorAddress) => {
        return {
          chainId,
          providers,
          sponsorAddress,
          api3ServerV1Address,
          fulfillmentGasLimit,
        };
      });
      return [...acc, ...providersSponsorGroups];
    },
    []
  );

  // Random wallet that will be used by all providers to estimate
  // the gas used to perform a single signed data data feed update
  const dummyAirnode = ethers.Wallet.createRandom();

  const balanceGroupsOrNull = await Promise.all(
    chainSponsorGroups.map((csg) => getSponsorBalanceStatus(csg, dummyAirnode))
  );
  const balanceGroups = balanceGroupsOrNull.filter((group): group is SponsorBalanceStatus => group !== null);

  // Update dataFeedUpdates with only sponsor wallets that have enough balance
  const fundedBalanceGroups = balanceGroups.filter(({ hasEnoughBalance }) => hasEnoughBalance === true);
  const fundedDataFeedUpdates = fundedBalanceGroups.reduce((acc: DataFeedUpdates, { chainId, sponsorAddress }) => {
    return {
      ...acc,
      [chainId]: { ...acc[chainId], [sponsorAddress]: config.triggers.dataFeedUpdates[chainId][sponsorAddress] },
    };
  }, {});

  const fundedSponsorWalletsPrivateKey = fundedBalanceGroups.reduce(
    (acc: SponsorWalletsPrivateKey, { sponsorAddress }) => {
      return {
        ...acc,
        [sponsorAddress]: sponsorWalletsPrivateKey[sponsorAddress],
      };
    },
    {}
  );

  updateState((state) => ({
    ...state,
    config: { ...config, triggers: { ['dataFeedUpdates']: fundedDataFeedUpdates } },
    sponsorWalletsPrivateKey: fundedSponsorWalletsPrivateKey,
  }));

  logger.info(
    `Fetched balances for ${balanceGroups.length}/${balanceGroupsOrNull.length} sponsor wallets. Continuing with ${fundedBalanceGroups.length} funded sponsor(s)`
  );
};

export const initializeWallets = () => {
  initializeAirseekerWallet();
  initializeSponsorWallets();
};
