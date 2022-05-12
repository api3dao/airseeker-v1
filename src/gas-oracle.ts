import { isEmpty } from 'lodash';
import { ethers } from 'ethers';
import { go } from '@api3/promise-utils';
import { logger } from './logging';
import { Provider, getState, updateState } from './state';
import { prepareGoOptions, sleep } from './utils';
import {
  DEFAULT_GAS_ORACLE_UPDATE_INTERVAL,
  DEFAULT_GAS_PRICE_PERCENTILE,
  DEFAULT_SAMPLE_BLOCK_COUNT,
  DEFAULT_BACK_UP_GAS_PRICE_GWEI,
  NO_ORACLE_EXIT_CODE,
} from './constants';

export type GasOracles = Record<string, ChainBlockData>;

type ChainBlockData = Record<string, ProviderBlockData>;

interface ProviderBlockData {
  blockData: BlockData[];
  percentileGasPrice?: ethers.BigNumber;
  backupGasPrice?: ethers.BigNumber;
}

export interface BlockData {
  blockNumber: number;
  gasPrices: ethers.BigNumber[];
}

export const getChainProviderGasPrice = (chainId: string, providerName: string) => {
  const { gasOracles } = getState();
  if (!gasOracles[chainId][providerName].percentileGasPrice) {
    logger.log(
      `No percentileGasPrice found for chain with ID ${chainId} and provider with name ${providerName}. Using back up gas price.`
    );
    return gasOracles[chainId][providerName].backupGasPrice!;
  }
  return gasOracles[chainId][providerName].percentileGasPrice!;
};

export const updateBlockData = (
  newBlockData: BlockData[],
  stateBlockData: BlockData[],
  chainId: string,
  providerName: string,
  sampleBlockCount: number,
  percentile: number
) => {
  // Add new block data to the top of the array
  const blockData = newBlockData.concat(stateBlockData);

  // Drop old blocks if exceeding the sampleBlockCount
  if (blockData.length > sampleBlockCount) {
    blockData.splice(sampleBlockCount);
  }

  // Sort blocks in descending order by blockNumber to ensure they are saved in order in state
  blockData.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));

  // Recalculate percentileGasPrice with new blockData
  const flattenedBlockData = blockData.flatMap((b) => b.gasPrices);
  const percentileGasPrice = getPercentile(percentile, flattenedBlockData);
  logger.log(
    `Calculated the percentileGasPrice on chain with ID ${chainId} for provider with name ${providerName} to be ${ethers.utils.formatUnits(
      percentileGasPrice,
      'gwei'
    )} gwei`
  );

  updateState((state) => ({
    ...state,
    gasOracles: {
      ...state.gasOracles,
      [chainId]: {
        ...state.gasOracles[chainId],
        [providerName]: { blockData, percentileGasPrice },
      },
    },
  }));
};

export const getPercentile = (percentile: number, array: ethers.BigNumber[]) => {
  array.sort((a, b) => (a.gt(b) ? 1 : -1));

  const index = Math.ceil(array.length * (percentile / 100)) - 1;
  return array[index];
};

export const updateBackupGasPrice = (chainId: string, providerName: string, backupGasPrice: ethers.BigNumber) => {
  updateState((state) => ({
    ...state,
    gasOracles: {
      ...state.gasOracles,
      [chainId]: {
        ...state.gasOracles[chainId],
        [providerName]: {
          ...(state.gasOracles[chainId] && state.gasOracles[chainId][providerName]
            ? state.gasOracles[chainId][providerName]
            : { blockData: [] }),
          backupGasPrice,
        },
      },
    },
  }));
};

export const fetchUpdateBlockData = async (
  provider: Provider,
  updateInterval: number,
  sampleBlockCount: number,
  percentile: number,
  backupGasPriceGwei: number
) => {
  const { rpcProvider, chainId, providerName } = provider;
  logger.log(`Fetching blocks on chain with ID ${chainId} for provider with name ${providerName}`);

  const state = getState();
  const startTime = Date.now();
  const totalTimeout = updateInterval * 1_000;

  // Get latest block
  const goRes = await go(() => rpcProvider.getBlockWithTransactions('latest'), {
    ...prepareGoOptions(startTime, totalTimeout),
    onAttemptError: (goError) => logger.log(`Failed attempt to get block. Error: ${goError.error}`),
  });
  if (!goRes.success) {
    logger.log(
      `Unable to fetch latest block with number on chain with ID ${chainId} for provider with name ${providerName}. Fetching backup feeData.`
    );

    // Attempt to get gas price from provider if fetching the latest block fails
    const feeDataRes = await go(() => rpcProvider.getFeeData(), {
      // TODO: check retry options
      ...prepareGoOptions(startTime, totalTimeout),
      onAttemptError: (goError) => logger.log(`Failed attempt to get fee data. Error: ${goError.error}`),
    });

    if (!feeDataRes.success || !feeDataRes.data.gasPrice || !feeDataRes.data.maxFeePerGas) {
      logger.log(`Unable to fetch gas price for chain with ID ${chainId} and provider with name ${providerName}.`);

      // Use the hardcoded back if back up gasTarget cannot be fetched and there are no gas values in state
      if (
        !state.gasOracles[chainId] ||
        !state.gasOracles[chainId][providerName] ||
        !state.gasOracles[chainId][providerName].percentileGasPrice ||
        !state.gasOracles[chainId][providerName].backupGasPrice
      ) {
        updateBackupGasPrice(chainId, providerName, ethers.utils.parseUnits(backupGasPriceGwei.toString(), 'gwei'));
      }
      return;
    }

    // Add back up gasTarget to state
    const { gasPrice, maxFeePerGas } = feeDataRes.data;
    updateBackupGasPrice(chainId, providerName, gasPrice || maxFeePerGas);
    return;
  }

  const { data: latestBlock } = goRes;

  // Calculate how many blocks to fetch since the last update
  const stateBlockData = state.gasOracles[chainId]?.[providerName]?.blockData || [];
  const latestBlockNumberInState = stateBlockData[0]?.blockNumber || 0;
  // Check if the latest block is already in state
  const latestBlockInStateMatch = stateBlockData.find((stateBlock) => stateBlock.blockNumber === latestBlock.number);

  // Skip processing if the latest block is already in state
  if (latestBlockInStateMatch) {
    logger.log(
      `Latest block on chain with ID ${chainId} for provider with name ${providerName} already in state. Skipping.`
    );
    return;
  }

  // Calculate how many blocks to fetch with a maximum of sampleBlockCount
  const blockCountToFetch =
    latestBlock.number - latestBlockNumberInState <= sampleBlockCount
      ? latestBlock.number - latestBlockNumberInState
      : sampleBlockCount;

  const newBlockData: BlockData[] = [];
  // Add the latest block if it has transactions and skip otherwise
  if (latestBlock.transactions.length) {
    newBlockData.push({
      blockNumber: latestBlock.number,
      gasPrices: latestBlock.transactions.map(
        (tx) => (tx.gasPrice || latestBlock.baseFeePerGas?.add(tx.maxPriorityFeePerGas!))!
      ),
    });
  }

  // Fetch additional blocks up to a limit of blockCountToFetch
  let loopIndex = 1;
  while (newBlockData.length < blockCountToFetch) {
    const blockNumberToFetch = latestBlock.number - loopIndex;
    const goRes = await go(() => rpcProvider.getBlockWithTransactions(blockNumberToFetch), {
      ...prepareGoOptions(startTime, totalTimeout),
      onAttemptError: (goError) => logger.log(`Failed attempt to get block. Error: ${goError.error}`),
    });
    if (!goRes.success) {
      logger.log(
        `Unable to fetch block with number ${blockNumberToFetch} on chain with ID ${chainId} for provider with name ${providerName}`
      );
      return;
    }

    const { data: block } = goRes;

    // Skip empty blocks
    if (block.transactions.length) {
      newBlockData.push({
        blockNumber: block.number,
        gasPrices: block.transactions.map((tx) => (tx.gasPrice || block.baseFeePerGas?.add(tx.maxPriorityFeePerGas!))!),
      });
    }

    // Stop processing if the next block is already in state
    if (latestBlockNumberInState === block.number - 1) {
      break;
    }

    loopIndex++;
  }

  updateBlockData(newBlockData, stateBlockData, chainId, providerName, sampleBlockCount, percentile);
};

export const fetchBlockDataInLoop = async (provider: Provider) => {
  const { config } = getState();
  const gasOracleConfig = config.chains[provider.chainId].gasOracle;

  const updateInterval = gasOracleConfig?.updateInterval || DEFAULT_GAS_ORACLE_UPDATE_INTERVAL;
  const sampleBlockCount = gasOracleConfig?.sampleBlockCount || DEFAULT_SAMPLE_BLOCK_COUNT;
  const percentile = gasOracleConfig?.percentile || DEFAULT_GAS_PRICE_PERCENTILE;
  const backupGasPriceGwei = gasOracleConfig?.backupGasPriceGwei || DEFAULT_BACK_UP_GAS_PRICE_GWEI;

  while (!getState().stopSignalReceived) {
    const startTimestamp = Date.now();

    await fetchUpdateBlockData(provider, updateInterval, sampleBlockCount, percentile, backupGasPriceGwei);

    const duration = Date.now() - startTimestamp;
    const waitTime = Math.max(0, updateInterval * 1_000 - duration);
    await sleep(waitTime);
  }
};

export const initiateFetchingBlockData = () => {
  logger.log(`Initiating gas oracles`);
  const { providers: stateProviders } = getState();

  if (isEmpty(stateProviders)) {
    logger.log('No providers for oracles found. Stopping.');
    process.exit(NO_ORACLE_EXIT_CODE);
  }

  // Start loops for each chain and provider
  const providers = Object.values(stateProviders).flatMap((provider) => provider);
  providers.forEach(fetchBlockDataInLoop);
};
