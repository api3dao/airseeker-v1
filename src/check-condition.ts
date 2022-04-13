import { ethers } from 'ethers';

// Number that represents 100% is chosen to avoid overflows in DapiServer's
// `calculateUpdateInPercentage()`. Since the reported data needs to fit
// into 224 bits, its multiplication by 10^8 is guaranteed not to overflow.
const HUNDRED_PERCENT = 1e8;

export const calculateUpdateInPercentage = (initialValue: ethers.BigNumber, updatedValue: ethers.BigNumber) => {
  const delta = updatedValue.sub(initialValue);
  const absoluteDelta = delta.abs();

  // Avoid division by 0
  const absoluteInitialValue = initialValue.isZero() ? ethers.BigNumber.from(1) : initialValue.abs();

  const change = absoluteDelta.mul(ethers.BigNumber.from(HUNDRED_PERCENT)).div(absoluteInitialValue);

  // Convert back to a percentage number
  return (change.toNumber() / HUNDRED_PERCENT) * 100;
};

export const checkUpdateCondition = async (
  providerUrl: string,
  dapiServer: ethers.Contract,
  beaconId: string,
  deviationThreshold: number,
  updatedApiValue: number
) => {
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, provider);

  const dapiServerResponse = await dapiServer.connect(voidSigner).functions.readWithDataPointId(beaconId);
  const updateInPercentage = calculateUpdateInPercentage(dapiServerResponse[0], ethers.BigNumber.from(updatedApiValue));

  return updateInPercentage > deviationThreshold;
};
