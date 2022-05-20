import { ethers } from 'ethers';
import { go } from '@api3/promise-utils';
import { logger } from './logging';
import { Provider } from './state';
import { getGasPrice } from './gas-prices';
import { prepareGoOptions } from './utils';
import { checkUpdateCondition } from './check-condition';
import {
  GAS_ORACLE_MAX_TIMEOUT,
  GAS_PRICE_PERCENTILE,
  GAS_PRICE_DEVIATION_THRESHOLD,
  BACK_UP_GAS_PRICE_GWEI,
  MIN_BLOCK_TRANSACTIONS,
} from './constants';
import { GasOracleConfig } from './validation';

interface ChainOptions {
  maxTimeout: number;
  percentile: number;
  backupGasPriceGwei: number;
  minBlockTransactions: number;
  gasPriceDeviationThreshold: number;
}

export const getPercentile = (percentile: number, array: ethers.BigNumber[]) => {
  if (!array.length) return;
  array.sort((a, b) => (a.gt(b) ? 1 : -1));

  const index = Math.ceil(array.length * (percentile / 100)) - 1;
  return array[index];
};

export const fetchBlockData = async (provider: Provider, chainOptions: ChainOptions) => {
  const { rpcProvider, chainId, providerName } = provider;
  const { maxTimeout, percentile, backupGasPriceGwei, minBlockTransactions, gasPriceDeviationThreshold } = chainOptions;
  const logOptionsChainId = { meta: { chainId, providerName } };
  logger.info(`Fetching block data`, logOptionsChainId);

  // Define block tags to fetch
  const blockTagsToFetch = [
    'latest',
    -20, // Fetch latest block number - 20
  ];

  const blockStartTime = Date.now();
  const totalTimeout = maxTimeout * 1_000;

  // Fetch blocks in parallel
  const blockPromises = blockTagsToFetch.map(
    async (blockTag) =>
      await go(() => rpcProvider.getBlockWithTransactions(blockTag), {
        ...prepareGoOptions(blockStartTime, totalTimeout),
        onAttemptError: (goError) =>
          logger.warn(`Failed attempt to get block. Error: ${goError.error}`, logOptionsChainId),
      })
  );

  // Reject as soon as possible if fetching a block fails for speed
  const resolvedGoBlocks = await Promise.all(blockPromises);

  const blockPercentileGasPrices = resolvedGoBlocks.reduce(
    (acc: { blockNumber: number; percentileGasPrice: ethers.BigNumber }[], block) => {
      // Stop processing if fetching the block was not succesful
      // or if the block does not have enough transactions
      if (!block.success || block.data.transactions.length < minBlockTransactions) return acc;

      // Calculate the percentileGasPrice
      const percentileGasPrice = getPercentile(
        percentile,
        block.data.transactions.map((tx) => (tx.gasPrice || block.data.baseFeePerGas!.add(tx.maxPriorityFeePerGas!))!)
      );

      // Note: percentileGasPrice should never be undefined as only arrays with items
      // should have been passed in at this point
      if (!percentileGasPrice) return acc;

      return [...acc, { percentileGasPrice, blockNumber: block.data.number }];
    },
    []
  );

  // Check percentileGasPrices only if we have the result from at least two blocks
  if (blockPercentileGasPrices.length > 1) {
    // Sort by blockNumber to know which one is the latest block
    const sortedBlockPercentileGasPrices = blockPercentileGasPrices.sort((a, b) => b.blockNumber - a.blockNumber);

    // Check that the percentileGasPrices are within the gasPriceDeviationThreshold to
    // protect against gas price spikes
    const exceedsGasPriceDeviationThreshold = checkUpdateCondition(
      sortedBlockPercentileGasPrices[1].percentileGasPrice,
      gasPriceDeviationThreshold,
      sortedBlockPercentileGasPrices[0].percentileGasPrice
    );

    // checkUpdateCondition returns true if the percentage difference between two BigNumbers is greater than the deviation threshold so this condition is fulfilled if the returned value is false (i.e. not exceeding the threshold)
    // Use the percentileGasPrice from the latest block
    if (!exceedsGasPriceDeviationThreshold) return sortedBlockPercentileGasPrices[0].percentileGasPrice;

    // Continue to fallback gas prices if the threshold is exceeded
    logger.warn(
      `percentileGasPrice exceeds the gasPriceDeviationThreshold set to (${gasPriceDeviationThreshold}%). Fetching backup gas price.`,
      logOptionsChainId
    );
  } else {
    logger.warn(
      `Unable to get enough blocks to calculate percentileGasPrice. Fetching backup gas price.`,
      logOptionsChainId
    );
  }

  // Attempt to get gasTarget as fallback
  const gasStartTime = Date.now();
  const gasTarget = await getGasPrice(provider, prepareGoOptions(gasStartTime, totalTimeout));

  if (!gasTarget) {
    // Use the hardcoded back if back up if gasTarget cannot be fetched
    logger.warn(
      `Unable to get fallback gasPrice. Using backupGasPriceGwei set to ${backupGasPriceGwei} gwei.`,
      logOptionsChainId
    );
    return ethers.utils.parseUnits(backupGasPriceGwei.toString(), 'gwei');
  }

  if (gasTarget.txType === 'legacy') return gasTarget.gasPrice;
  return gasTarget.maxFeePerGas;
};

export const getChainProviderConfig = (gasOracleConfig?: GasOracleConfig) => {
  const maxTimeout = gasOracleConfig?.maxTimeout || GAS_ORACLE_MAX_TIMEOUT;
  const percentile = gasOracleConfig?.percentile || GAS_PRICE_PERCENTILE;
  const backupGasPriceGwei = gasOracleConfig?.backupGasPriceGwei || BACK_UP_GAS_PRICE_GWEI;
  const minBlockTransactions = gasOracleConfig?.minBlockTransactions || MIN_BLOCK_TRANSACTIONS;
  const gasPriceDeviationThreshold = gasOracleConfig?.gasPriceDeviationThreshold || GAS_PRICE_DEVIATION_THRESHOLD;

  return { maxTimeout, percentile, backupGasPriceGwei, minBlockTransactions, gasPriceDeviationThreshold };
};

// Fetch new block data on call and return the updated gas price
export const getOracleGasPrice = async (provider: Provider, gasOracleConfig?: GasOracleConfig) => {
  // Get gas oracle config for provider
  const chainOptions = getChainProviderConfig(gasOracleConfig);

  // Fetch and process block data
  const gasPrice = await fetchBlockData(provider, chainOptions);

  return gasPrice;
};
