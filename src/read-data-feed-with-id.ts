import { DapiServer } from '@api3/airnode-protocol-v1';
import { GoAsyncOptions, go } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { logger, LogOptionsOverride } from './logging';

export interface DataFeed {
  value: ethers.BigNumber;
  timestamp: number;
}

export const readDataFeedWithId = async (
  voidSigner: ethers.VoidSigner,
  dapiServer: DapiServer,
  dataFeedId: string,
  goOptions: GoAsyncOptions,
  logOptions: LogOptionsOverride
): Promise<DataFeed | null> => {
  const logOptionsDapiServerAddress = {
    ...logOptions,
    additional: { ...logOptions.additional, 'Dapi-Server': dapiServer.address },
  };

  const goDataFeed = await go(() => dapiServer.connect(voidSigner).readDataFeedWithId(dataFeedId), {
    ...goOptions,
    onAttemptError: (goError) =>
      logger.warn(`Failed attempt to read data feed. Error: ${goError.error}`, logOptionsDapiServerAddress),
  });
  if (!goDataFeed.success) {
    logger.warn(`Unable to read data feed. Error: ${goDataFeed.error}`, logOptionsDapiServerAddress);
    return null;
  }

  return goDataFeed.data;
};
