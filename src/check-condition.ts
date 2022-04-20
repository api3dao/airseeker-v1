import { ethers } from 'ethers';

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
  dapiServer: ethers.Contract,
  beaconId: string,
  deviationThreshold: number,
  apiValue: number
) => {
  const [dapiServerValue, _timestamp] = await dapiServer.connect(voidSigner).readDataFeedWithId(beaconId);
  const updateInPercentage = calculateUpdateInPercentage(dapiServerValue, ethers.BigNumber.from(apiValue));
  const threshold = ethers.BigNumber.from(deviationThreshold * HUNDRED_PERCENT).div(ethers.BigNumber.from(100));

  return updateInPercentage.gt(threshold);
};
