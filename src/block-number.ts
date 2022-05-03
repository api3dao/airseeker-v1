import { go, GoAsyncOptions } from '@api3/promise-utils';
import { logger } from './logging';
import { Provider } from './state';

export const getCurrentBlockNumber = async (provider: Provider, goOptions: GoAsyncOptions): Promise<number | null> => {
  const { chainId, rpcProvider, providerName } = provider;
  const logOptionsChainId = { meta: { chainId, providerName } };

  const goBlockNumber = await go(() => rpcProvider.getBlockNumber(), {
    ...goOptions,
    onAttemptError: (goError) =>
      logger.warn(`Failed attempt to get a block number. Error: ${goError.error}`, logOptionsChainId),
  });

  if (!goBlockNumber.success) {
    logger.warn(`Unable to get block number. Error: ${goBlockNumber.error}`, logOptionsChainId);
    return null;
  }

  const blockNumber = goBlockNumber.data;
  logger.info(`Current block number: ${blockNumber}`, logOptionsChainId);

  return blockNumber;
};
