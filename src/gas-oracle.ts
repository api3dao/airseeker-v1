import { isEmpty } from 'lodash';
import { ethers } from 'ethers';
import { logger } from '@api3/airnode-utilities';
import { go } from '@api3/promise-utils';
import { Provider, getState, updateState } from './state';
import { sleep } from './utils';
import {
  DEFAULT_GAS_ORACLE_UPDATE_INTERVAL,
  DEFAULT_GAS_PRICE_PERCENTILE,
  DEFAULT_SAMPLE_BLOCK_COUNT,
  NO_ORACLE_EXIT_CODE,
} from './constants';

export type GasOracles = Record<string, ChainBlockData>;

type ChainBlockData = Record<string, ProviderBlockData>;

interface ProviderBlockData {
  blockData: BlockData[];
  percentileGasPrice: ethers.BigNumber;
}

interface BlockData {
  blockNumber: number;
  gasPrices: ethers.BigNumber[];
}

export const getChainProviderPercentileGasPrice = (chainId: string, providerName: string) => {
  const { gasOracles } = getState();
  return gasOracles[chainId][providerName].percentileGasPrice;
};

const updateBlockData = (
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

const getPercentile = (percentile: number, array: ethers.BigNumber[]) => {
  array.sort((a, b) => (a.gt(b) ? 1 : -1));

  const index = Math.ceil(array.length * (percentile / 100)) - 1;
  return array[index];
};

const fetchUpdateBlockData = async (provider: Provider, sampleBlockCount: number, percentile: number) => {
  const { rpcProvider, chainId, providerName } = provider;
  logger.log(`Fetching blocks on chain with ID ${chainId} for provider with name ${providerName}`);

  // Get latest block
  const goRes = await go(() => rpcProvider.getBlockWithTransactions('latest'), {
    onAttemptError: (goError) => logger.log(`Failed attempt to get block. Error: ${goError.error}`),
  });
  if (!goRes.success) {
    logger.log(
      `Unable to fetch latest block with number on chain with ID ${chainId} for provider with name ${providerName}`
    );
    return;
  }

  const { data: latestBlock } = goRes;

  const state = getState();

  // Calculate how many blocks to fetch since the last update
  const stateBlockData = state.gasOracles[chainId]?.[providerName]?.blockData || [];
  const latestBlockNumberInState = stateBlockData[0]?.blockNumber || 0;

  // Skip processing if the latest block is already in state
  if (latestBlock.number === latestBlockNumberInState) {
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

  while (!getState().stopSignalReceived) {
    const startTimestamp = Date.now();

    await fetchUpdateBlockData(provider, sampleBlockCount, percentile);

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
