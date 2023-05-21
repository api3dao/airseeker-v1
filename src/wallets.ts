import { ethers } from 'ethers';
import { uniq } from 'lodash';
import { go, goSync } from '@api3/promise-utils';
import * as node from '@api3/airnode-node';
import * as protocol from '@api3/airnode-protocol';
import { getState, updateState, SponsorWalletsPrivateKey, Provider } from './state';
import { shortenAddress } from './utils';
import { logger } from './logging';
import { DataFeedUpdates } from './validation';
import { RateLimitedProvider } from './providers';

export type ChainSponsorGroup = {
  chainId: string;
  sponsorAddress: string;
  providers: Provider[];
};

export type SponsorBalanceStatus = {
  chainId: string;
  sponsorAddress: string;
  isEmpty: boolean;
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

export const retrieveSponsorWalletAddress = (sponsorAddress: string): string => {
  const { sponsorWalletsPrivateKey } = getState();
  if (!sponsorWalletsPrivateKey || !sponsorWalletsPrivateKey[sponsorAddress])
    throw new Error(`Pre-generated private key not found for sponsor ${sponsorAddress}`);
  return new ethers.Wallet(sponsorWalletsPrivateKey[sponsorAddress]).address;
};

export const isBalanceZero = async (
  rpcProvider: RateLimitedProvider,
  sponsorWalletAddress: string
): Promise<boolean> => {
  const goResult = await go(() => rpcProvider.getBalance(sponsorWalletAddress), { retries: 1 });
  if (!goResult.success) {
    throw new Error(goResult.error.message);
  }
  return goResult.data.isZero();
};

export const getSponsorBalanceStatus = async (
  chainSponsorGroup: ChainSponsorGroup
): Promise<SponsorBalanceStatus | null> => {
  const { chainId, sponsorAddress, providers } = chainSponsorGroup;
  const logOptions = { meta: { 'Chain-ID': chainId, Sponsor: shortenAddress(sponsorAddress) } };

  const goResult = goSync(() => retrieveSponsorWalletAddress(sponsorAddress));
  if (!goResult.success) {
    const message = `Failed to retrieve wallet address for sponsor ${sponsorAddress}. Skipping. Error: ${goResult.error.message}`;
    logger.warn(message, logOptions);
    return null;
  }
  const sponsorWalletAddress = goResult.data;

  const balanceProviders = providers.map(async ({ rpcProvider }) => isBalanceZero(rpcProvider, sponsorWalletAddress));
  const goAnyResult = await go(() => Promise.any(balanceProviders));
  
  if (!goAnyResult.success) {
    const message = `Failed to get balance for ${sponsorWalletAddress}. No provider was resolved. Error: ${goAnyResult.error.message}`;
    logger.warn(message, logOptions);
    return null;
  }
  const isEmpty = goAnyResult.data;
  return { sponsorAddress, chainId, isEmpty };
};

export const filterEmptySponsors = async () => {
  const { config, providers: stateProviders } = getState();

  const chainSponsorGroups = Object.entries(config.triggers.dataFeedUpdates).reduce(
    (acc: ChainSponsorGroup[], [chainId, dataFeedUpdatesPerSponsor]) => {
      const providers = stateProviders[chainId];
      const providersSponsorGroups = Object.keys(dataFeedUpdatesPerSponsor).map((sponsorAddress) => {
        return {
          chainId,
          providers,
          sponsorAddress,
        };
      });
      return [...acc, ...providersSponsorGroups];
    },
    []
  );

  const balanceGroupsOrNull = await Promise.all(chainSponsorGroups.map(getSponsorBalanceStatus));
  const balanceGroups = balanceGroupsOrNull.filter((group): group is SponsorBalanceStatus => group !== null);

  // Update dataFeedUpdates with non-empty sponsor wallets
  const fundedBalanceGroups = balanceGroups.filter(({ isEmpty }) => isEmpty === false);
  const fundedDataFeedUpdates = fundedBalanceGroups.reduce((acc: DataFeedUpdates, { chainId, sponsorAddress }) => {
    return {
      ...acc,
      [chainId]: { ...acc[chainId], [sponsorAddress]: config.triggers.dataFeedUpdates[chainId][sponsorAddress] },
    };
  }, {});

  updateState((state) => ({
    ...state,
    config: { ...config, triggers: { ['dataFeedUpdates']: fundedDataFeedUpdates } },
  }));

  logger.info(
    `Fetched balances for ${balanceGroups.length}/${balanceGroupsOrNull.length} sponsor wallets. Continuing with ${fundedBalanceGroups.length} funded sponsors.`
  );
};

export const initializeWallets = () => {
  initializeAirseekerWallet();
  initializeSponsorWallets();
};
