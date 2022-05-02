import { ethers } from 'ethers';
import { DapiServer } from '@api3/airnode-protocol-v1';
import { go, GoAsyncOptions } from '@api3/promise-utils';
import { logger } from './logging';

// Number that represents 100% is chosen to avoid overflows in DapiServer's
// `calculateUpdateInPercentage()`. Since the reported data needs to fit
// into 224 bits, its multiplication by 10^8 is guaranteed not to overflow.
export const HUNDRED_PERCENT = 1e8;

export const calculateUpdateInPercentage = (initialValue: ethers.BigNumber, updatedValue: ethers.BigNumber) => {
  const delta = updatedValue.sub(initialValue);
  const absoluteDelta = delta.abs();

  // Avoid division by 0
  const absoluteInitialValue = initialValue.isZero() ? ethers.BigNumber.from(1) : initialValue.abs();

  return absoluteDelta.mul(ethers.BigNumber.from(HUNDRED_PERCENT)).div(absoluteInitialValue);
};

export const checkUpdateCondition = async (
  voidSigner: ethers.VoidSigner,
  dapiServer: DapiServer,
  beaconId: string,
  deviationThreshold: number,
  apiValue: ethers.BigNumber,
  goOptions: GoAsyncOptions
): Promise<boolean | null> => {
  const goDataFeed = await go(() => dapiServer.connect(voidSigner).readDataFeedWithId(beaconId), {
    ...goOptions,
    onAttemptError: (goError) => logger.log(`Failed attempt to read data feed. Error: ${goError.error}`),
  });
  if (!goDataFeed.success) {
    logger.log(`Unable to read data feed. Error: ${goDataFeed.error}`);
    return null;
  }

  const [dapiServerValue, _timestamp] = goDataFeed.data;
  const updateInPercentage = calculateUpdateInPercentage(dapiServerValue, apiValue);
  const threshold = ethers.BigNumber.from(Math.trunc(deviationThreshold * HUNDRED_PERCENT)).div(
    ethers.BigNumber.from(100)
  );

  return updateInPercentage.gt(threshold);
};
