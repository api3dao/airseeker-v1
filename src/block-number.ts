import { go, GoAsyncOptions } from '@api3/promise-utils';
import { logger } from './logging';
import { Provider } from './state';

export const getCurrentBlockNumber = async (provider: Provider, goOptions: GoAsyncOptions): Promise<number | null> => {
  const goBlockNumber = await go(() => provider.rpcProvider.getBlockNumber(), goOptions);

  if (!goBlockNumber.success) {
    logger.log(`Unable to get block number. Error: ${goBlockNumber.error}`);
    return null;
  }

  const blockNumber = goBlockNumber.data;
  logger.log(`Current block number for chain with ID ${provider.chainId}: ${blockNumber}`);

  return blockNumber;
};
