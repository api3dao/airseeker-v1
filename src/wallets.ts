import * as node from '@api3/airnode-node';
import * as protocol from '@api3/airnode-protocol';
import { Api3ServerV1__factory } from '@api3/airnode-protocol-v1';
import { getGasPrice } from '@api3/airnode-utilities';
import { go, goSync } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { uniq } from 'lodash';
import { LogOptionsOverride, logger } from './logging';
import { Provider, SponsorWalletsPrivateKey, getState, updateState } from './state';
import { shortenAddress } from './utils';
import { DataFeedUpdates } from './validation';

export type ChainSponsorGroup = {
  chainId: string;
  providers: Provider[];
  chainOptions: node.ChainOptions;
  sponsorAddress: string;
  api3ServerV1Address: string;
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

export const hasEnoughBalance = async (
  chainOptions: node.ChainOptions,
  sponsorWallet: ethers.Wallet,
  airnode: ethers.Wallet,
  api3ServerV1: ethers.Contract,
  logOptions: LogOptionsOverride
): Promise<boolean> => {
  // Fetch current sponsorWallet balance
  const goGetBalance = await go(() => sponsorWallet.getBalance(), { retries: 1 });
  if (!goGetBalance.success) {
    logger.error("Failed to get sponsorWallet's balance", goGetBalance.error, logOptions);
    throw new Error(goGetBalance.error.message);
  }
  const balance = goGetBalance.data;

  // Get the latest gas price using chain strategies from config
  const [logs, gasTarget] = await getGasPrice(sponsorWallet.provider, chainOptions);
  logs.forEach((log) =>
    log.error ? logger.error(log.error.message, null, logOptions) : logger.debug(log.message, logOptions)
  );
  if (!gasTarget) {
    throw new Error('Failed to get gas price');
  }
  const gasPrice = gasTarget.type === 2 ? gasTarget.maxFeePerGas : gasTarget.gasPrice;

  // Estimate the units of gas required for updating a single dummy beacon with signed data
  const goEstimateGas = await go(
    async () => {
      const dummyBeaconTemplateId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const dummyBeaconTimestamp = Math.floor(Date.now() / 1000);
      const randomBytes = ethers.utils.randomBytes(Math.floor(Math.random() * 27) + 1);
      const dummyBeaconData = ethers.utils.defaultAbiCoder.encode(
        ['int224'],
        // Any radom number that fits into an int224
        [ethers.BigNumber.from(randomBytes)]
      );
      const dummyBeaconSignature = await airnode.signMessage(
        ethers.utils.arrayify(
          ethers.utils.solidityKeccak256(
            ['bytes32', 'uint256', 'bytes'],
            [dummyBeaconTemplateId, dummyBeaconTimestamp, dummyBeaconData]
          )
        )
      );
      return api3ServerV1
        .connect(sponsorWallet)
        .estimateGas.updateBeaconWithSignedData(
          airnode.address,
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
  const estimatedGas = goEstimateGas.data;

  logger.info(`Current balance: ${ethers.utils.formatEther(balance)} ether`, logOptions);
  logger.info(`Current gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`, logOptions);
  logger.info(`Estimated gas needed: ${estimatedGas.toString()}`, logOptions);

  // Check if the current balance is enough to cover the estimated gas cost
  return balance.gte(estimatedGas.mul(gasPrice));
};

export const getSponsorBalanceStatus = async (
  chainSponsorGroup: ChainSponsorGroup,
  airnode: ethers.Wallet
): Promise<SponsorBalanceStatus | null> => {
  const { chainId, providers, chainOptions, sponsorAddress, api3ServerV1Address } = chainSponsorGroup;

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
    hasEnoughBalance(chainOptions, sponsorWallet.connect(rpcProvider), airnode, api3ServerV1, {
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
      const chainOptions = config.chains[chainId].options;
      const api3ServerV1Address = config.chains[chainId].contracts['Api3ServerV1'];
      const providersSponsorGroups = Object.keys(dataFeedUpdatesPerSponsor).map((sponsorAddress) => {
        return {
          chainId,
          providers,
          chainOptions,
          sponsorAddress,
          api3ServerV1Address,
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
