import { ethers } from 'ethers';
import { go } from '@api3/promise-utils';
import { PriorityFee } from '@api3/airnode-node';
import { parsePriorityFee } from '@api3/airnode-utilities';
import { logger } from './logging';
import { Provider } from './state';
import { prepareGoOptions } from './utils';
import {
  GAS_ORACLE_MAX_TIMEOUT_S,
  GAS_PRICE_MAX_DEVIATION_MULTIPLIER,
  GAS_PRICE_PERCENTILE,
  MIN_TRANSACTION_COUNT,
  PAST_TO_COMPARE_IN_BLOCKS,
} from './constants';
import { GasOracleConfig } from './validation';

interface GasOracleOptions {
  maxTimeout: number;
  percentile: number;
  fallbackGasPrice: PriorityFee;
  recommendedGasPriceMultiplier?: number;
  minTransactionCount: number;
  maxDeviationMultiplier: number;
  pastToCompareInBlocks: number;
}

export const multiplyGasPrice = (gasPrice: ethers.BigNumber, gasPriceMultiplier: number) =>
  gasPrice.mul(ethers.BigNumber.from(Math.round(gasPriceMultiplier * 100))).div(ethers.BigNumber.from(100));

export const getPercentile = (percentile: number, array: ethers.BigNumber[]) => {
  if (!array.length) return;
  array.sort((a, b) => (a.gt(b) ? 1 : -1));

  const index = Math.ceil(array.length * (percentile / 100)) - 1;
  return array[index];
};

// Check whether a value's change exceeds the maxDeviationMultipiler limit
// and returns false if it does and true otherwise.
export const checkMaxDeviationLimit = (
  value: ethers.BigNumber,
  referenceValue: ethers.BigNumber,
  maxDeviationMultiplier: number
) => {
  // Handle maximum two decimals for maxDeviationMultiplier
  const maxDeviationMultiplierBN = ethers.BigNumber.from(Math.round(maxDeviationMultiplier * 100));

  return (
    // Check that the current value is not higher than the maxDeviationMultiplier allows
    referenceValue.gt(value.mul(ethers.BigNumber.from(100)).div(maxDeviationMultiplierBN)) &&
    // Check that the current value is not lower than the maxDeviationMultiplier allows
    referenceValue.lt(value.mul(maxDeviationMultiplierBN).div(ethers.BigNumber.from(100)))
  );
};

export const fetchBlockData = async (provider: Provider, gasOracleOptions: GasOracleOptions) => {
  const { rpcProvider, chainId, providerName } = provider;
  const {
    maxTimeout,
    percentile,
    fallbackGasPrice,
    recommendedGasPriceMultiplier,
    minTransactionCount,
    maxDeviationMultiplier,
    pastToCompareInBlocks,
  } = gasOracleOptions;
  const logOptionsChainId = { meta: { chainId, providerName } };
  logger.info(`Fetching block data`, logOptionsChainId);

  // Define block tags to fetch
  const blockTagsToFetch = ['latest', -pastToCompareInBlocks];

  const totalTimeout = maxTimeout * 1_000;

  // Fetch blocks in parallel
  const blockStartTime = Date.now();
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

  // Calculate gas price percentiles for each block
  const blockPercentileGasPrices = resolvedGoBlocks.reduce(
    (acc: { blockNumber: number; percentileGasPrice: ethers.BigNumber }[], block) => {
      // Stop processing if fetching the block was not succesful, there is no block data,
      // or if the block does not have enough transactions
      if (
        !block.success ||
        !block.data ||
        !block.data.transactions ||
        block.data.transactions.length < minTransactionCount
      )
        return acc;

      // Filter for transactions with gas prices
      const transactionsWithGasPrices = block.data.transactions.reduce((acc: ethers.BigNumber[], tx) => {
        if (tx.gasPrice) return [...acc, tx.gasPrice];
        if (block.data.baseFeePerGas && tx.maxPriorityFeePerGas)
          return [...acc, block.data.baseFeePerGas.add(tx.maxPriorityFeePerGas)];

        return acc;
      }, []);

      // Stop processing if there are not enough transactions with gas prices
      if (transactionsWithGasPrices.length < minTransactionCount) return acc;

      const percentileGasPrice = getPercentile(percentile, transactionsWithGasPrices);

      // Note: percentileGasPrice should never be undefined as only arrays with items
      // should have been passed in at this point
      if (!percentileGasPrice) return acc;

      return [...acc, { percentileGasPrice, blockNumber: block.data.number }];
    },
    []
  );

  // Check percentileGasPrices only if we have the transactions from two blocks
  if (blockPercentileGasPrices.length === 2) {
    // Sort by blockNumber
    const sortedBlockPercentileGasPrices = blockPercentileGasPrices.sort((a, b) => b.blockNumber - a.blockNumber);
    const [latestPercentileGasPrice, referencePercentileGasPrice] = sortedBlockPercentileGasPrices;

    // Check that the latest block percentileGasPrice does not exceed the maxDeviationMultiplier compared to
    // the reference block to protect against gas price spikes
    const isWithinDeviationLimit = checkMaxDeviationLimit(
      latestPercentileGasPrice.percentileGasPrice,
      referencePercentileGasPrice.percentileGasPrice,
      maxDeviationMultiplier
    );

    // Return the percentile for the latest block if within the limit
    if (isWithinDeviationLimit) {
      logger.info(
        `Gas price set to ${ethers.utils.formatUnits(latestPercentileGasPrice.percentileGasPrice, 'gwei')} gwei`,
        logOptionsChainId
      );
      return latestPercentileGasPrice.percentileGasPrice;
    }

    // Continue to fallback gas prices if the deviation limit is exceeded
    logger.warn(
      `Latest block percentileGasPrice exceeds the max deviation multiplier limit set to (${maxDeviationMultiplier}%). Fetching backup gas price.`,
      logOptionsChainId
    );
  } else {
    logger.warn(
      `Unable to get enough blocks to calculate percentileGasPrice. Fetching backup gas price.`,
      logOptionsChainId
    );
  }

  // Attempt to get gasPrice as fallback
  const gasStartTime = Date.now();
  const gasPrice = await go(() => rpcProvider.getGasPrice(), {
    ...prepareGoOptions(gasStartTime, totalTimeout),
    onAttemptError: (goError) =>
      logger.warn(`Failed attempt to get gas price. Error: ${goError.error}`, logOptionsChainId),
  });

  if (gasPrice.success) {
    const multipliedGasPrice = recommendedGasPriceMultiplier
      ? multiplyGasPrice(gasPrice.data, recommendedGasPriceMultiplier)
      : gasPrice.data;

    logger.info(
      `Fallback gas price set to ${ethers.utils.formatUnits(multipliedGasPrice, 'gwei')} gwei`,
      logOptionsChainId
    );

    return multipliedGasPrice;
  }

  // Use the hardcoded fallback gas price if the gas price cannot be fetched
  logger.warn(
    `Unable to get fallback gasPrice from provider. Using fallbackGasPrice from config set to ${fallbackGasPrice.value} ${fallbackGasPrice.unit}.`,
    logOptionsChainId
  );

  return parsePriorityFee(fallbackGasPrice);
};

export const getChainProviderConfig = (gasOracleConfig: GasOracleConfig) => {
  const fallbackGasPrice = gasOracleConfig.fallbackGasPrice;
  const maxTimeout = gasOracleConfig.maxTimeout || GAS_ORACLE_MAX_TIMEOUT_S;
  const recommendedGasPriceMultiplier = gasOracleConfig.recommendedGasPriceMultiplier;
  const percentile = gasOracleConfig.latestGasPriceOptions?.percentile || GAS_PRICE_PERCENTILE;
  const minTransactionCount = gasOracleConfig.latestGasPriceOptions?.minTransactionCount || MIN_TRANSACTION_COUNT;
  const maxDeviationMultiplier =
    gasOracleConfig.latestGasPriceOptions?.maxDeviationMultiplier || GAS_PRICE_MAX_DEVIATION_MULTIPLIER;
  const pastToCompareInBlocks =
    gasOracleConfig.latestGasPriceOptions?.pastToCompareInBlocks || PAST_TO_COMPARE_IN_BLOCKS;

  return {
    maxTimeout,
    percentile,
    fallbackGasPrice,
    recommendedGasPriceMultiplier,
    minTransactionCount,
    maxDeviationMultiplier,
    pastToCompareInBlocks,
  };
};

// Fetch new block data on call and return the updated gas price
export const getOracleGasPrice = async (provider: Provider, gasOracleConfig: GasOracleConfig) => {
  // Get gas oracle config for provider
  const gasOracleOptions = getChainProviderConfig(gasOracleConfig);

  // Fetch and process block data
  const gasPrice = await fetchBlockData(provider, gasOracleOptions);

  return gasPrice;
};
