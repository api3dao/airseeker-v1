import { ethers } from 'ethers';
import { SignedData } from './validation';

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

export interface OnChainBeaconData {
  value: ethers.BigNumber;
  timestamp: number;
}

export const checkUpdateCondition = async (
  onChainData: OnChainBeaconData,
  deviationThreshold: number,
  apiValue: ethers.BigNumber
): Promise<boolean> => {
  const { value, timestamp: _timestamp } = onChainData;
  const updateInPercentage = calculateUpdateInPercentage(value, apiValue);
  const threshold = ethers.BigNumber.from(Math.trunc(deviationThreshold * HUNDRED_PERCENT)).div(
    ethers.BigNumber.from(100)
  );

  return updateInPercentage.gt(threshold);
};

/**
 * Returns true when the signed data response is fresh enough to be used for an on chain update.
 *
 * Update transaction with stale data would revert on chain, draining the sponsor wallet. See:
 * https://github.com/api3dao/airnode-protocol-v1/blob/e0d778fabff0df888987a6db31498c93ee2f6219/contracts/dapis/DapiServer.sol#L867
 * This can happen if the gateway or Airseeker is down and Airkeeper does the updates instead.
 */
export const checkSignedDataFreshness = (onChainData: OnChainBeaconData, signedData: SignedData) => {
  return parseInt(signedData.data.timestamp, 10) > onChainData.timestamp;
};
